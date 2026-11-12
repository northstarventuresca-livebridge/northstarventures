package ca.northstarventures.spectra

import android.Manifest
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
            Toast.makeText(this, "Join a hunting team first", Toast.LENGTH_LONG).show()
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
            prefs.activeTeam.isBlank() -> "Pocket GPS: join a team"
            active -> "Pocket GPS ON · screen-off tracking"
            else -> "Pocket GPS OFF · start before heading out"
        }
        button.text = if (active) "Stop GPS" else "Start GPS"
        button.isEnabled = prefs.activeTeam.isNotBlank()
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

    private fun dp(n: Int) = (resources.displayMetrics.density * n).toInt()
}
