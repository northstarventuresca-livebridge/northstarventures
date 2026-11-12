package ca.northstarventures.spectra

import android.content.Context
import android.net.ConnectivityManager
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
    private val alertExecutor = Executors.newSingleThreadExecutor()
    private val alertPolling = AtomicBoolean(false)

    data class HunterAlert(
        val id: String,
        val kind: String,
        val author: String,
        val authorName: String,
        val body: String,
        val markerIcon: String,
        val created: Long
    )

    fun kick(context: Context) {
        val app = context.applicationContext
        executor.execute { perform(app) }
    }


    fun perform(context: Context) {
        if (!syncing.compareAndSet(false, true)) return
        try {
            val connection = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            if (connection.activeNetwork == null) return
            val prefs = TrackingPrefs(context)
            val store = LocationStore(context)
            for (team in prefs.knownTeams()) {
                val token = prefs.token(team) ?: continue
                val member = prefs.member(team)
                if (member.isBlank()) continue
                var batches = 0
                while (batches < 1000) {
                    val fixes = store.nextBatchFor(team, member, 80)
                    if (fixes.isEmpty()) break
                    val payload = org.json.JSONArray()
                    fixes.forEach { fix ->
                        payload.put(JSONObject().put("id", fix.id)
                            .put("lat", fix.lat).put("lon", fix.lon)
                            .put("accuracy", fix.accuracy).put("created", fix.capturedAt))
                    }
                    val response = request("/api/gps/batch?team=" + team, "POST", token,
                        JSONObject().put("points", payload))
                    if (response.code in 200..299) {
                        val accepted = JSONObject(response.body).optJSONArray("accepted")
                            ?: break
                        val ids = (0 until accepted.length()).mapNotNull {
                            accepted.optString(it).takeIf(String::isNotEmpty)
                        }
                        if (ids.size != fixes.size || ids.toSet() != fixes.map { it.id }.toSet()) break
                        store.acknowledgeBatch(ids)
                    } else {
                        if (response.code == 401 && team == prefs.activeTeam) {
                            prefs.enabled = false
                            context.stopService(android.content.Intent(
                                context, TrackingService::class.java))
                        }
                        break
                    }
                    batches++
                }
            }
        } catch (_: Exception) {
            // Preserve every original fix if the network blips during a batch.
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

    /**
     * Poll a small authenticated event feed while the native tracking service runs.
     * The WebView can be suspended or the screen locked; this never uses browser JS.
     * Once a batch is handled, the cursor advances using server time minus a short
     * overlap to avoid racing a concurrently committed event.
     */
    fun checkHunterAlerts(context: Context, deliver: (String, List<HunterAlert>) -> Unit) {
        if (!alertPolling.compareAndSet(false, true)) return
        val app = context.applicationContext
        alertExecutor.execute {
            try {
                val prefs = TrackingPrefs(app)
                if (!prefs.enabled || !prefs.sharing) return@execute
                val team = prefs.activeTeam
                if (team.isBlank()) return@execute
                val token = prefs.token(team) ?: return@execute
                val now = System.currentTimeMillis()
                val last = prefs.alertCursor(team)
                val after = if (last > 0L && last <= now + 60_000L)
                    maxOf(now - 24L * 60 * 60_000, last - 3_000L)
                else now - 10 * 60_000L
                val result = request("/api/native/alerts?team=" + team + "&after=" + after,
                    "GET", token, null)
                if (result.code !in 200..299) return@execute
                val parsed = JSONObject(result.body)
                val records = parsed.optJSONArray("alerts") ?: return@execute
                val alerts = ArrayList<HunterAlert>()
                for (i in 0 until records.length()) {
                    val item = records.optJSONObject(i) ?: continue
                    val id = item.optString("id")
                    val created = item.optLong("created", 0)
                    val kind = item.optString("kind")
                    if (id.isEmpty() || created <= 0 || prefs.hasSeenAlert(team, id)) continue
                    if (kind != "help" && kind != "help_clear" &&
                        !(kind == "pin" && item.optString("marker_icon") in listOf("cow", "bull"))) continue
                    alerts.add(HunterAlert(id, kind, item.optString("author"),
                        item.optString("author_name", "Hunter"), item.optString("body"),
                        item.optString("marker_icon"), created))
                }
                // When multiple teams are joined, don't ever deliver team A's
                // alerts into team B's active app session.
                if (prefs.activeTeam != team || !prefs.enabled) return@execute
                deliver(team, alerts)
                val serverTime = parsed.optLong("server_time", now)
                if (serverTime > 0 && serverTime <= System.currentTimeMillis() + 60_000L) {
                    // A full page may have more alerts waiting. Never advance past
                    // messages the server has not returned yet.
                    val lastRecord = records.optJSONObject(records.length() - 1)
                    val pageTime = if (records.length() >= 80)
                        lastRecord?.optLong("created", serverTime) ?: serverTime
                    else serverTime
                    prefs.setAlertCursor(team, maxOf(last, pageTime - 3_000L))
                }
            } catch (_: Exception) {
                // Network or notification failure: cursor doesn't move, retry later.
            } finally { alertPolling.set(false) }
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
