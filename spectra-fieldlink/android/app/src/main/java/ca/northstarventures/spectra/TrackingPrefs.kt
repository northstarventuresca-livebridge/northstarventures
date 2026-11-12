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
