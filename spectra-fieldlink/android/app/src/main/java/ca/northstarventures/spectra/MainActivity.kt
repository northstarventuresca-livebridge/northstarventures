package ca.northstarventures.spectra

import android.Manifest
import android.app.AlertDialog
import android.text.InputType
import android.text.TextUtils
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.widget.EditText
import java.net.HttpURLConnection
import java.net.URL
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * The existing FieldLink website is the UI; the native service owns pocket/locked-phone GPS.
 * JS messages are only accepted from the exact HTTPS origin and its main frame.
 */
class MainActivity : Activity() {
    private val origin = "https://fieldlink.northstarventures.ca"
    private val preassignedTeamInvite = BuildConfig.TEAM_INVITE
    private lateinit var prefs: TrackingPrefs
    private lateinit var webView: WebView
    private lateinit var status: TextView
    private lateinit var button: Button
    private val uiHandler = Handler(Looper.getMainLooper())
    private var stoppedPromptShownThisResume = false
    private var lastManualStartAt = 0L
    private val statusTicker = object : Runnable {
        override fun run() {
            if (::prefs.isInitialized && ::status.isInitialized) renderTracking()
            uiHandler.postDelayed(this, 2_500L)
        }
    }

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        prefs = TrackingPrefs(this)
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(12, 23, 18))
        }
        webView = WebView(this)
        layout.addView(webView, LinearLayout.LayoutParams(-1, 0, 1f))
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(10), dp(4), dp(10), dp(4))
            setBackgroundColor(Color.rgb(25, 46, 35))
        }
        status = TextView(this).apply {
            textSize = 13f
            setTextColor(Color.rgb(221, 241, 217))
        }
        button = Button(this).apply {
            setOnClickListener { toggleTracking() }
            isAllCaps = false
        }
        bar.addView(status, LinearLayout.LayoutParams(0, dp(51), 1f))
        bar.addView(button, LinearLayout.LayoutParams(-2, dp(51)))
        layout.addView(bar, LinearLayout.LayoutParams(-1, -2))
        setContentView(layout)
        configureWebView()
        renderTracking()
        if (state == null) webView.loadUrl(origin + "/")
        else webView.restoreState(state)
        if (prefs.activeTeam.isBlank()) webView.post { showFirstRun() }
    }

    private fun configureWebView() {
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.setGeolocationEnabled(true)
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (url == null || !url.startsWith(origin + "/")) return
                webView.evaluateJavascript("window.SpectraNativeShareReady = true;", null)
                val team = prefs.activeTeam
                if (team.isNotBlank()) prefs.session(team)?.let(::hydrateWebSession)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url ?: return false
                if (url.scheme == "https" && url.host == "fieldlink.northstarventures.ca") return false
                if (url.scheme == "https") startActivity(Intent(Intent.ACTION_VIEW, url))
                return true
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                siteOrigin: String, callback: GeolocationPermissions.Callback
            ) {
                callback.invoke(siteOrigin, siteOrigin == origin && hasFinePermission(), false)
            }
        }
        check(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            "This Android WebView requires WEB_MESSAGE_LISTENER support."
        }
        WebViewCompat.addWebMessageListener(
            webView, "SpectraNative", setOf(origin)
        ) { _, message, sourceOrigin, isMainFrame, _ ->
            if (!isMainFrame || sourceOrigin.toString() != origin) return@addWebMessageListener
            try {
                val body = JSONObject(message.data ?: return@addWebMessageListener)
                if (body.optString("type") == "share_invite") {
                    val link = body.optString("url")
                    val invite = Uri.parse(link)
                    val code = invite.getQueryParameter("code") ?: ""
                    if (invite.scheme == "https" &&
                        invite.host == "fieldlink.northstarventures.ca" &&
                        invite.path == "/install" &&
                        Regex("[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}").matches(code)) {
                        val title = body.optString("team_name", "Hunting team").take(45)
                        runOnUiThread {
                            val message = "Join " + title +
                                " on Spectra FieldLink. Download the Android app and get your " +
                                "private team code at this link:\n" + link
                            val send = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_SUBJECT, "Install Spectra FieldLink")
                                putExtra(Intent.EXTRA_TEXT, message)
                            }
                            startActivity(Intent.createChooser(send, "Invite hunter"))
                        }
                    }
                    return@addWebMessageListener
                }
                if (body.optString("type") == "gps_once") {
                    if (prefs.enabled && prefs.sharing && hasFinePermission()) {
                        ContextCompat.startForegroundService(this,
                            Intent(this, TrackingService::class.java).setAction(TrackingService.ACTION_START))
                    } else runOnUiThread { toggleTracking() }
                    return@addWebMessageListener
                }
                if (body.optString("type") != "session") return@addWebMessageListener
                val team = body.optString("team_id")
                val member = body.optString("member_id")
                val token = body.optString("token")
                val sharing = body.optBoolean("sharing", false)
                if (team.isBlank() || token.isBlank()) {
                    // The webpage boots in demo mode before the secure session is restored.
                    // Never stop an already-running native GPS service just because
                    // a WebView reloaded without its session.
                    return@addWebMessageListener
                } else {
                    val oldTeam = prefs.activeTeam
                    prefs.saveAccount(team, member, token)
                    prefs.sharing = sharing
                    if (!sharing) {
                        prefs.enabled = false
                        stopService(Intent(this, TrackingService::class.java))
                    } else if (prefs.enabled && oldTeam != team && hasFinePermission()) {
                        startTracker()
                    }
                }
                prefs.saveProfile(team, body.optString("member_name", "Hunter"),
                    body.optString("title", "Hunting team"),
                    body.optString("member_color", "#B7EA84"), body.optString("role", "hunter"))
                renderTracking()
            } catch (_: Exception) {
                // Never accept invalid or untrusted credentials from the page.
            }
        }
    }

    private fun toggleTracking() {
        if (prefs.enabled) {
            prefs.enabled = false
            stopService(Intent(this, TrackingService::class.java))
            renderTracking()
            return
        }
        if (prefs.activeTeam.isBlank() || prefs.token(prefs.activeTeam).isNullOrBlank()) {
            showFirstRun()
            return
        }
        if (!prefs.sharing) {
            Toast.makeText(this, "Resume GPS sharing in Spectra Setup first", Toast.LENGTH_LONG).show()
            return
        }
        if (!hasFinePermission()) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION), 10)
            return
        }
        maybeAskNotificationsThenStart()
    }

    private fun maybeAskNotificationsThenStart() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 11)
            return
        }
        startTracker()
    }

    private fun startTracker() {
        if (!hasFinePermission() || !prefs.sharing || prefs.activeTeam.isBlank()) return
        prefs.enabled = true
        lastManualStartAt = SystemClock.elapsedRealtime()
        try {
            ContextCompat.startForegroundService(this, Intent(this, TrackingService::class.java)
                .setAction(TrackingService.ACTION_START))
        } catch (error: Exception) {
            prefs.enabled = false
            Toast.makeText(this, "GPS could not start: " + (error.message ?: "Check location permissions"),
                Toast.LENGTH_LONG).show()
        }
        renderTracking()
        uiHandler.postDelayed({ if (!isFinishing) renderTracking() }, 1200L)
    }

    private fun hasFinePermission() =
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>,
                                            grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 10) {
            if (hasFinePermission()) maybeAskNotificationsThenStart()
            else Toast.makeText(this, "Precise location is required for hunting GPS tracking",
                Toast.LENGTH_LONG).show()
        }
        if (requestCode == 11) {
            if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "Phone alerts are disabled; tracking can still run",
                    Toast.LENGTH_LONG).show()
            }
            startTracker()
        }
    }

    private fun renderTracking() {
        val active = prefs.enabled && prefs.sharing && TrackingService.trackingActive
        val latest = prefs.lastFixAt
        val age = if (latest > 0) System.currentTimeMillis() - latest else Long.MAX_VALUE
        status.text = when {
            prefs.activeTeam.isBlank() -> "Pocket GPS · Join your team"
            !prefs.sharing -> "GPS SHARING PAUSED"
            active && age >= 0 && age < 120_000 -> "GPS ON · Last fix " + (age / 1000) + "s ago"
            active && age >= 120_000 && age < 600_000 -> "GPS ON · Last fix " + (age / 60_000) + "m ago"
            active && age >= 600_000 -> "GPS ON · Waiting for fresh fix"
            active -> "GPS ON · Waiting for first fix"
            prefs.enabled -> "GPS STARTING · Checking tracker…"
            else -> "GPS OFF · Location not shared"
        }
        status.setTextColor(if (active) Color.rgb(183, 234, 132)
                            else Color.rgb(255, 193, 120))
        button.text = when {
            prefs.activeTeam.isBlank() -> "Join team"
            prefs.enabled -> "Stop GPS"
            else -> "Start GPS"
        }
        button.isEnabled = true
    }

    private fun showStoppedTrackingPrompt() {
        if (isFinishing || TrackingService.trackingActive || !prefs.sharing ||
            prefs.activeTeam.isBlank()) return
        AlertDialog.Builder(this)
            .setTitle("GPS tracking is OFF")
            .setMessage("Spectra is open, but your phone is not currently sharing its location. " +
                "Tap Start GPS to resume background tracking. You can stop it at any time from " +
                "the Android tracking notification.")
            .setPositiveButton("Start GPS") { _, _ -> toggleTracking() }
            .setNegativeButton("Keep GPS off", null)
            .show()
    }

    override fun onResume() {
        super.onResume()
        if (!::prefs.isInitialized) return
        uiHandler.removeCallbacks(statusTicker)
        uiHandler.post(statusTicker)
        // An Android Task Manager stop can kill the service without calling onDestroy.
        // Verify the actual service on every foreground entry; never silently resume
        // location sharing after an explicit stop or use a stale 'enabled' preference.
        uiHandler.postDelayed({
            if (isFinishing || !::prefs.isInitialized || !prefs.sharing ||
                prefs.activeTeam.isBlank() || TrackingService.trackingActive) return@postDelayed
            if (prefs.enabled &&
                SystemClock.elapsedRealtime() - lastManualStartAt < 4_000L) return@postDelayed
            prefs.enabled = false
            renderTracking()
            if (!stoppedPromptShownThisResume) {
                stoppedPromptShownThisResume = true
                showStoppedTrackingPrompt()
            }
        }, 1250L)
    }

    override fun onPause() {
        uiHandler.removeCallbacks(statusTicker)
        stoppedPromptShownThisResume = false
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }



    /**
     * New hunters never need Chrome or a device-pairing code. All signup is
     * inside Spectra; a team invitation may be preloaded in the installer or
     * pasted from a captain's invitation message.
     *
     * A generic APK cannot safely know which private team to join. A team-linked
     * installer may prefill the invite at build time, but it should be distributed
     * only to trusted team members while its invitation remains valid.
     */
    private fun showFirstRun() {
        if (isFinishing || prefs.activeTeam.isNotBlank()) return
        val name = EditText(this).apply {
            hint = "Your name"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
            maxLines = 1
        }
        val invite = EditText(this).apply {
            hint = "12-character team code"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true)
            if (preassignedTeamInvite.isNotBlank()) {
                setText(preassignedTeamInvite)
                visibility = View.GONE
            }
        }
        val form = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), dp(10))
            addView(name)
            addView(invite)
        }
        val message = if (preassignedTeamInvite.isNotBlank())
            "Welcome to Spectra! Enter your name to join your hunting team. Your phone will ask permission to keep you visible to your team."
        else "Welcome to Spectra! Enter your name and the team code from your captain. Allow Android to access your location to keep your teammates updated, even with your screen off."
        val dialog = AlertDialog.Builder(this)
            .setTitle("Join your hunting team")
            .setMessage(message)
            .setView(form)
            .setPositiveButton("Join & enable GPS", null)
            .setNegativeButton("Not now", null)
            .setNeutralButton("Existing website account", null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val display = name.text.toString().trim()
                val code = extractInvite(invite.text.toString())
                when {
                    display.length !in 2..28 ->
                        name.error = "Enter a name between 2 and 28 characters"
                    code == null ->
                        invite.error = "Enter the team code from your captain"
                    else -> {
                        dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = false
                        joinTeamInApp(code, display) { error ->
                            if (error == null) dialog.dismiss()
                            else {
                                dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = true
                                Toast.makeText(this, error, Toast.LENGTH_LONG).show()
                            }
                        }
                    }
                }
            }
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener {
                dialog.dismiss()
                pairPhone()
            }
        }
        dialog.show()
    }

    private fun extractInvite(raw: String): String? {
        val clean = raw.trim()
        if (Regex("[a-f0-9]{48}").matches(clean)) return clean
        if (Regex("[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}").matches(clean.uppercase())) {
            return clean.uppercase()
        }
        return try {
            val url = Uri.parse(clean)
            if (url.scheme != "https" || url.host != "fieldlink.northstarventures.ca") null
            else url.getQueryParameter("invite")?.takeIf { Regex("[a-f0-9]{48}").matches(it) }
        } catch (_: Exception) { null }
    }

    private fun joinTeamInApp(code: String, display: String, done: (String?) -> Unit) {
        Thread {
            try {
                val json = JSONObject()
                    .put("code", code).put("name", display).put("color", "#B7EA84")
                val conn = URL(origin + "/api/register").openConnection() as HttpURLConnection
                val response: JSONObject
                try {
                    conn.requestMethod = "POST"
                    conn.connectTimeout = 12_000
                    conn.readTimeout = 12_000
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.outputStream.use { it.write(json.toString().toByteArray(Charsets.UTF_8)) }
                    val status = conn.responseCode
                    val text = (if (status in 200..299) conn.inputStream else conn.errorStream)
                        ?.bufferedReader()?.use { it.readText() } ?: "{}"
                    response = JSONObject(text)
                    if (status !in 200..299) throw IllegalStateException(
                        response.optString("error", "Invitation expired. Ask your captain to resend it."))
                } finally { conn.disconnect() }
                val team = response.getString("team_id")
                val member = response.getString("member_id")
                prefs.saveAccount(team, member, response.getString("token"))
                prefs.saveProfile(team, response.getString("member_name"),
                    response.getString("title"), response.getString("member_color"),
                    response.getString("role"))
                prefs.sharing = true
                runOnUiThread {
                    activateWebSession(response)
                    renderTracking()
                    done(null)
                    // This explicit Join & enable GPS action is the foreground user
                    // consent to begin the Android permission and tracking flow.
                    if (hasFinePermission()) maybeAskNotificationsThenStart()
                    else requestPermissions(
                        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION), 10)
                }
            } catch (e: Exception) {
                runOnUiThread { done(e.message ?: "Could not join the team. Check your connection.") }
            }
        }.start()
    }


    private fun hydrateWebSession(account: JSONObject) {
        val encoded = JSONObject.quote(account.toString())
        webView.evaluateJavascript(
            "(function(){try{var s=JSON.parse(localStorage.getItem('fieldlink_session')||'null');" +
            "if(!s||s.team_id!==" + JSONObject.quote(account.optString("team_id")) +
            "||s.token!==" + JSONObject.quote(account.optString("token")) + "){" +
            "localStorage.setItem('fieldlink_session'," + encoded + ");" +
            "localStorage.setItem('fieldlink_sessions',JSON.stringify([" + encoded + "].map(JSON.parse)));" +
            "localStorage.setItem('fieldlink_live_gps'," + JSONObject.quote(if (prefs.sharing) "1" else "0") + ");" +
            "location.reload();}}catch(e){}})();", null)
    }

    private fun activateWebSession(account: JSONObject) {
        val uri = webView.url?.let { Uri.parse(it) }
        if (uri?.scheme != "https" || uri.host != "fieldlink.northstarventures.ca") {
            webView.loadUrl(origin + "/")
            return
        }
        val payload = JSONObject.quote(account.toString())
        webView.evaluateJavascript(
            "localStorage.setItem('fieldlink_session'," + payload + ");" +
            "localStorage.setItem('fieldlink_sessions',JSON.stringify([" + payload +
            "].map(JSON.parse)));" +
            "localStorage.setItem('fieldlink_live_gps','1');location.reload();", null)
    }


    private fun pairPhone() {
        val code = EditText(this).apply {
            hint = "8-digit phone link code"
            inputType = InputType.TYPE_CLASS_NUMBER
            filters = arrayOf(android.text.InputFilter.LengthFilter(8))
        }
        AlertDialog.Builder(this)
            .setTitle("Connect your existing hunter")
            .setMessage("In Chrome, open Spectra → Setup → Connect native Android app → Generate phone link code. Enter it here; no duplicate hunter account is created.")
            .setView(code)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Pair phone") { _, _ ->
                val value = code.text.toString().trim()
                if (value.length != 8) Toast.makeText(this, "Enter all 8 digits", Toast.LENGTH_LONG).show()
                else redeemPhoneCode(value)
            }
            .show()
    }

    private fun redeemPhoneCode(code: String) {
        Toast.makeText(this, "Linking Spectra phone…", Toast.LENGTH_SHORT).show()
        Thread {
            try {
                val conn = URL(origin + "/api/native/pair/redeem").openConnection() as HttpURLConnection
                val reply: JSONObject
                try {
                    conn.requestMethod = "POST"
                    conn.connectTimeout = 10_000
                    conn.readTimeout = 10_000
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.outputStream.use {
                        it.write(JSONObject().put("code", code).toString().toByteArray(Charsets.UTF_8))
                    }
                    val status = conn.responseCode
                    val data = (if (status in 200..299) conn.inputStream else conn.errorStream)
                        ?.bufferedReader()?.use { it.readText() } ?: "{}"
                    reply = JSONObject(data)
                    if (status !in 200..299) throw IllegalStateException(reply.optString("error", "Code not accepted"))
                } finally { conn.disconnect() }
                val team = reply.getString("team_id")
                val member = reply.getString("member_id")
                val token = reply.getString("token")
                prefs.saveAccount(team, member, token)
                prefs.saveProfile(team, reply.getString("member_name"),
                    reply.getString("title"), reply.getString("member_color"),
                    reply.getString("role"))
                prefs.sharing = true
                runOnUiThread {
                    activateWebSession(JSONObject()
                        .put("team_id", team).put("member_id", member)
                        .put("member_name", reply.getString("member_name"))
                        .put("member_color", reply.getString("member_color"))
                        .put("title", reply.getString("title"))
                        .put("role", reply.getString("role")).put("token", token))
                    renderTracking()
                    Toast.makeText(this, "Hunter linked! Tap Start GPS.", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this, "Pairing failed: " + (e.message ?: "Try again"), Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }

    private fun dp(n: Int) = (resources.displayMetrics.density * n).toInt()
}
