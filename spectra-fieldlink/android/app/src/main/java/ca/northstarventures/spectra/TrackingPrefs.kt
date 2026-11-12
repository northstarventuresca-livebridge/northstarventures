package ca.northstarventures.spectra

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Hunter bearer tokens are encrypted under an Android Keystore-backed AES/GCM key.
 * Ordinary location rows stay in private application SQLite storage (Android FBE at rest).
 * No token is placed in URLs, notifications, logs, or location database rows.
 */
class TrackingPrefs(context: Context) {
    private val prefs = context.getSharedPreferences("spectra_pocket_gps", Context.MODE_PRIVATE)
    private val alias = "spectra-fieldlink-auth-v1"

    var enabled: Boolean
        get() = prefs.getBoolean("enabled", false)
        set(value) = prefs.edit().putBoolean("enabled", value).apply()

    var sharing: Boolean
        get() = prefs.getBoolean("sharing", true)
        set(value) = prefs.edit().putBoolean("sharing", value).apply()

    /** Timestamp of last GPS fix successfully stored in the offline outbox. */
    var lastFixAt: Long
        get() = prefs.getLong("last_fix_at", 0L)
        set(value) = prefs.edit().putLong("last_fix_at", value).apply()

    var activeTeam: String
        get() = prefs.getString("active_team", "") ?: ""
        set(value) = prefs.edit().putString("active_team", value).apply()

    fun saveAccount(team: String, member: String, token: String) {
        require(Regex("[A-Z0-9]{8,16}").matches(team))
        require(Regex("[A-Za-z0-9_-]{8,64}").matches(member))
        require(Regex("[a-f0-9]{48}").matches(token))
        prefs.edit().putString("member_" + team, member)
            .putString("token_" + team, encrypt(token))
            .putString("active_team", team).apply()
    }

    fun saveProfile(team: String, name: String, title: String, color: String, role: String) {
        if (team.isBlank()) return
        prefs.edit()
            .putString("name_" + team, name.take(28))
            .putString("title_" + team, title.take(60))
            .putString("color_" + team, color.take(12))
            .putString("role_" + team, role.take(18))
            .apply()
    }

    fun session(team: String): org.json.JSONObject? {
        val bearer = token(team) ?: return null
        val memberId = member(team)
        if (memberId.isEmpty()) return null
        return org.json.JSONObject()
            .put("team_id", team)
            .put("member_id", memberId)
            .put("token", bearer)
            .put("member_name", prefs.getString("name_" + team, "Hunter"))
            .put("member_color", prefs.getString("color_" + team, "#B7EA84"))
            .put("title", prefs.getString("title_" + team, "Hunting team"))
            .put("role", prefs.getString("role_" + team, "hunter"))
    }

    fun member(team: String): String = prefs.getString("member_" + team, "") ?: ""
    fun token(team: String): String? = try {
        prefs.getString("token_" + team, null)?.let(::decrypt)
    } catch (_: Exception) { null }

    fun knownTeams(): Set<String> =
        prefs.all.keys.filter { it.startsWith("token_") }.map { it.removePrefix("token_") }.toSet()

    fun requestSeen(team: String, eventId: String): Boolean {
        val key = "last_requests_" + team
        val ids = prefs.getString(key, "")!!.split(",").filter { it.isNotBlank() }
        if (eventId in ids) return true
        prefs.edit().putString(key, (ids + eventId).takeLast(100).joinToString(",")).apply()
        return false
    }

    /** Native alert deduplication persists across screen locks and process recreation. */
    fun hasSeenAlert(team: String, eventId: String): Boolean =
        eventId in (prefs.getString("alert_seen_" + team, "") ?: "")
            .split(",").filter { it.isNotBlank() }

    fun markAlertSeen(team: String, eventId: String) {
        val key = "alert_seen_" + team
        val previous = (prefs.getString(key, "") ?: "").split(",").filter { it.isNotBlank() }
        if (eventId !in previous)
            prefs.edit().putString(key, (previous + eventId).takeLast(200).joinToString(",")).apply()
    }

    /** Time cursor is server-issued and only advances after alerts are processed. */
    fun alertCursor(team: String): Long = prefs.getLong("alert_cursor_" + team, 0L)
    fun setAlertCursor(team: String, value: Long) =
        prefs.edit().putLong("alert_cursor_" + team, value).apply()

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build())
            generateKey()
        }
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val packed = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(packed, Base64.NO_WRAP)
    }

    private fun decrypt(encoded: String): String {
        val bytes = Base64.decode(encoded, Base64.NO_WRAP)
        require(bytes.size > 28)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
    }
}
