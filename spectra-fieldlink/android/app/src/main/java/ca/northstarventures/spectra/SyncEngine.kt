package ca.northstarventures.spectra

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Exact HTTPS origin, authenticated per team; the server uses event IDs to dedupe.
 * Sync is opportunistic: each new fix, network restoration, and periodic WorkManager.
 */
object SyncEngine {
    private const val ORIGIN = "https://fieldlink.northstarventures.ca"
    private val executor = Executors.newSingleThreadExecutor()
    private val syncing = AtomicBoolean(false)
    private val polling = AtomicBoolean(false)

    fun kick(context: Context) {
        val app = context.applicationContext
        executor.execute { perform(app) }
    }

    fun perform(context: Context) {
        if (!syncing.compareAndSet(false, true)) return
        try {
            val prefs = TrackingPrefs(context)
            val store = LocationStore(context)
            // Process the complete backlog across all known team memberships.
            var batches = 0
            while (batches < 400) {
                val fixes = store.nextBatch()
                if (fixes.isEmpty()) break
                var progress = false
                for (fix in fixes) {
                    val token = prefs.token(fix.team) ?: continue
                    if (prefs.member(fix.team) != fix.member) continue
                    val event = JSONObject()
                        .put("id", fix.id)
                        .put("kind", "position")
                        .put("body", "GPS update")
                        .put("lat", fix.lat)
                        .put("lon", fix.lon)
                        .put("accuracy", fix.accuracy)
                        .put("created", fix.capturedAt)
                        .put("transport", "android-native")
                    val result = request(
                        "/api/events?team=" + fix.team, "POST", token, event
                    )
                    if (result.code in 200..299) {
                        store.acknowledge(fix.id)
                        progress = true
                    } else if (result.code == 401 && fix.team == prefs.activeTeam) {
                        // Revoked hunter session: don't continue collecting into a team
                        // that is no longer authorized.
                        prefs.enabled = false
                        context.stopService(android.content.Intent(context, TrackingService::class.java))
                    }
                }
                if (!progress) break
                batches++
            }
        } catch (_: Exception) {
            // Retain all unacknowledged rows for the next network opportunity.
        } finally { syncing.set(false) }
    }

    fun checkLocationRequests(context: Context, handler: (String) -> Unit) {
        if (!polling.compareAndSet(false, true)) return
        val app = context.applicationContext
        executor.execute {
            try {
                val prefs = TrackingPrefs(app)
                if (!prefs.enabled || !prefs.sharing) return@execute
                val team = prefs.activeTeam
                val member = prefs.member(team)
                val token = prefs.token(team) ?: return@execute
                val result = request("/api/events?team=" + team, "GET", token, null)
                if (result.code !in 200..299) return@execute
                val events = JSONObject(result.body).optJSONArray("events") ?: return@execute
                val now = System.currentTimeMillis()
                for (i in 0 until events.length()) {
                    val event = events.optJSONObject(i) ?: continue
                    if (event.optString("kind") != "location_request" ||
                        event.optString("body") != member ||
                        event.optString("author") == member) continue
                    val created = event.optLong("created", 0)
                    if (created <= 0 || now - created !in 0..180_000) continue
                    val id = event.optString("id")
                    if (id.isEmpty() || prefs.requestSeen(team, id)) continue
                    handler(event.optString("author_name", "Another hunter"))
                }
            } catch (_: Exception) {
            } finally { polling.set(false) }
        }
    }

    private data class Response(val code: Int, val body: String)

    private fun request(path: String, method: String, token: String, body: JSONObject?): Response {
        val conn = (URL(ORIGIN + path).openConnection() as HttpURLConnection)
        try {
            conn.requestMethod = method
            conn.connectTimeout = 9_000
            conn.readTimeout = 9_000
            conn.setRequestProperty("Authorization", "Bearer " + token)
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("Cache-Control", "no-store")
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = conn.responseCode
            val text = try {
                (if (status in 200..299) conn.inputStream else conn.errorStream)
                    ?.bufferedReader()?.use { it.readText() } ?: ""
            } catch (_: Exception) { "" }
            return Response(status, text)
        } finally { conn.disconnect() }
    }
}
