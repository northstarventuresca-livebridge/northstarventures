package ca.northstarventures.spectra

import android.Manifest
import android.app.AlertDialog
import android.text.InputType
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
    private lateinit var prefs: TrackingPrefs
    private lateinit var webView: WebView
    private lateinit var status: TextView
    private lateinit var button: Button

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
    }

    private fun configureWebView() {
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.setGeolocationEnabled(true)
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        webView.webViewClient = object : WebViewClient() {
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
                if (body.optString("type") != "session") return@addWebMessageListener
                val team = body.optString("team_id")
                val member = body.optString("member_id")
                val token = body.optString("token")
                val sharing = body.optBoolean("sharing", false)
                if (team.isBlank() || token.isBlank()) {
                    prefs.enabled = false
                    stopService(Intent(this, TrackingService::class.java))
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
            pairPhone()
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
        ContextCompat.startForegroundService(this, Intent(this, TrackingService::class.java)
            .setAction(TrackingService.ACTION_START))
        renderTracking()
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
        val active = prefs.enabled && prefs.sharing
        status.text = when {
            prefs.activeTeam.isBlank() -> "Pocket GPS: pair existing hunter"
            active -> "Pocket GPS ON · screen-off tracking"
            else -> "Pocket GPS OFF · start before heading out"
        }
        button.text = if (prefs.activeTeam.isBlank()) "Pair phone" else if (active) "Stop GPS" else "Start GPS"
        button.isEnabled = true
    }

    override fun onResume() {
        super.onResume()
        if (::prefs.isInitialized) {
            renderTracking()
            if (prefs.enabled && prefs.sharing && hasFinePermission()) startTracker()
        }
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
                prefs.sharing = true
                runOnUiThread {
                    val session = JSONObject()
                        .put("team_id", team).put("member_id", member)
                        .put("member_name", reply.getString("member_name"))
                        .put("member_color", reply.getString("member_color"))
                        .put("title", reply.getString("title"))
                        .put("role", reply.getString("role")).put("token", token)
                    val url = webView.url?.let { Uri.parse(it) }
                    if (url?.scheme == "https" && url.host == "fieldlink.northstarventures.ca") {
                        val quoted = JSONObject.quote(session.toString())
                        webView.evaluateJavascript(
                            "localStorage.setItem('fieldlink_session'," + quoted + ");" +
                            "localStorage.setItem('fieldlink_sessions',JSON.stringify([" +
                            quoted + "].map(JSON.parse)));" +
                            "location.reload();", null
                        )
                    } else webView.loadUrl(origin + "/")
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
