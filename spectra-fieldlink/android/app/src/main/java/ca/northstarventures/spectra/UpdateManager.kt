package ca.northstarventures.spectra

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.widget.Toast
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Interim signed sideload updater until Google Play internal testing is available.
 * No silent installs. Downloads are SHA-256 checked, package-name checked and
 * verified to have exactly the existing Android signing certificate.
 *
 * The installed app's account, encrypted token, notification settings and GPS
 * permissions survive a signed, in-place Android update.
 */
object UpdateManager {
    private const val VERSION_URL = "https://fieldlink.northstarventures.ca/api/android/latest"
    private const val TRUSTED_APK =
        "https://github.com/northstarventuresca-livebridge/northstarventures/releases/download/spectra-fieldlink-android-beta/Spectra-FieldLink.apk"
    private val busy = AtomicBoolean(false)
    private var lastCheckElapsed = 0L
    private var pendingFile: File? = null
    private var promptedVersion = 0

    private data class Release(
        val version: Int, val name: String, val url: String, val sha256: String, val size: Long
    )

    fun check(activity: Activity) {
        val now = SystemClock.elapsedRealtime()
        if (lastCheckElapsed != 0L && now - lastCheckElapsed < 30 * 60_000L) return
        if (!busy.compareAndSet(false, true)) return
        lastCheckElapsed = now
        Thread {
            try {
                val response = open(VERSION_URL)
                val release = try {
                    val code = response.responseCode
                    if (code == 404) return@Thread // Nothing permanently signed yet.
                    if (code !in 200..299) return@Thread
                    response.inputStream.bufferedReader().use { input ->
                        val obj = JSONObject(input.readText())
                        Release(obj.getInt("version_code"), obj.getString("version_name"),
                            obj.getString("url"), obj.getString("sha256"),
                            obj.getLong("size"))
                    }
                } finally { response.disconnect() }
                if (release.version <= BuildConfig.VERSION_CODE ||
                    release.version == promptedVersion ||
                    release.url != TRUSTED_APK ||
                    !Regex("[a-f0-9]{64}").matches(release.sha256) ||
                    release.size !in 100_000..65_000_000) return@Thread
                activity.runOnUiThread {
                    if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
                    promptedVersion = release.version
                    AlertDialog.Builder(activity)
                        .setTitle("Spectra update available")
                        .setMessage("Version " + release.name + " is available. " +
                            "Install it over your current Spectra app to keep your hunting team, " +
                            "account and GPS settings. Android will ask you to approve the update.")
                        .setPositiveButton("Download & update") { _, _ -> download(activity, release) }
                        .setNegativeButton("Later", null).show()
                }
            } catch (_: Exception) {
                // Offline hunting mode must not be blocked by update checks.
            } finally { busy.set(false) }
        }.start()
    }

    fun resumeInstallIfAllowed(activity: Activity) {
        val file = pendingFile ?: return
        if (!file.exists()) { pendingFile = null; return }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()) return
        pendingFile = null
        launchSystemInstaller(activity, file)
    }

    private fun download(activity: Activity, release: Release) {
        if (!busy.compareAndSet(false, true)) return
        val progress = AlertDialog.Builder(activity)
            .setTitle("Updating Spectra")
            .setMessage("Downloading and checking the signed update…")
            .setCancelable(false).create()
        progress.show()
        Thread {
            var temp: File? = null
            try {
                val dir = File(activity.cacheDir, "updates").apply { mkdirs() }
                val ready = File(dir, "Spectra-FieldLink-v" + release.version + ".apk")
                val partial = File(dir, "spectra-pending.tmp")
                temp = partial
                val digest = MessageDigest.getInstance("SHA-256")
                val connection = open(release.url)
                try {
                    check(connection.responseCode in 200..299) { "Update download unavailable" }
                    var total = 0L
                    connection.inputStream.use { input ->
                        FileOutputStream(partial).use { output ->
                            val buffer = ByteArray(64 * 1024)
                            while (true) {
                                val count = input.read(buffer)
                                if (count < 0) break
                                total += count
                                check(total <= 65_000_000L) { "Update file too large" }
                                digest.update(buffer, 0, count)
                                output.write(buffer, 0, count)
                            }
                        }
                    }
                    check(total == release.size) { "Incomplete update download" }
                } finally { connection.disconnect() }
                val downloadedHash = digest.digest().joinToString("") { "%02x".format(it) }
                check(downloadedHash == release.sha256) { "Update signature checksum mismatch" }
                check(validatePackage(activity, partial, release.version)) {
                    "This update has a different Android signing key. The current install " +
                    "cannot be updated in place."
                }
                if (ready.exists()) ready.delete()
                check(partial.renameTo(ready)) { "Could not prepare update file" }
                temp = null
                activity.runOnUiThread {
                    progress.dismiss()
                    if (!activity.isFinishing && !activity.isDestroyed)
                        install(activity, ready)
                }
            } catch (e: Exception) {
                temp?.delete()
                activity.runOnUiThread {
                    progress.dismiss()
                    Toast.makeText(activity, "Update failed: " +
                        (e.message ?: "Please try again"), Toast.LENGTH_LONG).show()
                }
            } finally { busy.set(false) }
        }.start()
    }

    @Suppress("DEPRECATION")
    private fun validatePackage(activity: Activity, file: File, newVersion: Int): Boolean {
        val pm = activity.packageManager
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
            PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val archive = pm.getPackageArchiveInfo(file.absolutePath, flags) ?: return false
        val installed = pm.getPackageInfo(activity.packageName, flags)
        if (archive.packageName != activity.packageName || archive.longVersionCode < newVersion ||
            archive.longVersionCode <= installed.longVersionCode) return false
        fun certs(pkg: PackageInfo): Set<String> {
            val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
                pkg.signingInfo?.apkContentsSigners else pkg.signatures
            return signatures?.map { signer ->
                MessageDigest.getInstance("SHA-256").digest(signer.toByteArray())
                    .joinToString("") { "%02x".format(it) }
            }?.toSet() ?: emptySet()
        }
        val current = certs(installed)
        return current.isNotEmpty() && current == certs(archive)
    }

    private fun install(activity: Activity, file: File) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()) {
            pendingFile = file
            AlertDialog.Builder(activity)
                .setTitle("Allow Spectra to install updates")
                .setMessage("Android requires permission to install updates from Spectra. " +
                    "Allow this source once, then return to the app. " +
                    "Samsung Auto Blocker may still need to be temporarily disabled " +
                    "for updates outside Google Play.")
                .setPositiveButton("Open Android settings") { _, _ ->
                    activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.packageName)))
                }
                .setNegativeButton("Not now", null).show()
            return
        }
        launchSystemInstaller(activity, file)
    }

    private fun launchSystemInstaller(activity: Activity, file: File) {
        try {
            val uri = FileProvider.getUriForFile(activity,
                activity.packageName + ".updates", file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                clipData = ClipData.newRawUri("Spectra update", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(activity, "Could not start Android installer: " +
                (e.message ?: "Unknown problem"), Toast.LENGTH_LONG).show()
        }
    }

    private fun open(link: String): HttpURLConnection {
        require(link == VERSION_URL || link == TRUSTED_APK)
        return (URL(link).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 12_000
            readTimeout = 35_000
            setRequestProperty("Accept", if (link == VERSION_URL) "application/json"
                else "application/vnd.android.package-archive")
            setRequestProperty("Cache-Control", "no-cache")
        }
    }
}
