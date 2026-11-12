package ca.northstarventures.spectra

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.net.ConnectivityManager
import android.net.Network
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/**
 * True native Android foreground *location* service:
 * - remains active when WebView/phone screen is off (subject to OS power controls)
 * - uses FusedLocationProviderClient, never browser JS timers
 * - adaptive 15s/60s/180s GPS requests, movement-checked updates
 * - each significant/heartbeat fix committed to SQLite before upload
 * - instant retry when cellular or Wi-Fi returns, plus WorkManager backup
 * - polls authenticated team requests while tracking is running
 */
class TrackingService : Service() {
    companion object {
        const val ACTION_START = "ca.northstarventures.spectra.START_TRACKING"
        const val ACTION_STOP = "ca.northstarventures.spectra.STOP_TRACKING"

        /** Actual foreground service state for same-process activity status checks. */
        @Volatile var trackingActive: Boolean = false
            private set
        private const val GPS_CHANNEL = "spectra_gps"
        private const val ALERT_CHANNEL = "spectra_requests"
        private const val SOS_CHANNEL = "spectra_sos_v1"
        private const val MOOSE_CHANNEL = "spectra_moose_v1"
        private const val ALERT_INTERVAL_MS = 20_000L
        private const val GPS_NOTIFICATION = 4821
        private const val MIN_POLL_MS = 45_000L
    }

    private lateinit var prefs: TrackingPrefs
    private lateinit var store: LocationStore
    private val main = Handler(Looper.getMainLooper())
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private var registered = false
    private var interval = 0L
    private var lastFix: Location? = null
    private var lastStored: Location? = null
    private var lastStoreElapsed = 0L
    private var movingAt = SystemClock.elapsedRealtime()
    private lateinit var connectivity: ConnectivityManager
    private var networkRegistered = false

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val location = result.lastLocation ?: return
            capture(location)
        }
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            SyncEngine.kick(applicationContext)
            if (::prefs.isInitialized && prefs.enabled) pollRequests()
        }
    }

    private val alertTicker = object : Runnable {
        override fun run() {
            if (prefs.enabled && prefs.sharing && trackingActive) {
                SyncEngine.checkHunterAlerts(applicationContext, ::deliverHunterAlerts)
                main.postDelayed(this, ALERT_INTERVAL_MS)
            }
        }
    }

    private val requestTicker = object : Runnable {
        override fun run() {
            if (prefs.enabled && prefs.sharing) {
                SyncEngine.kick(applicationContext)
                pollRequests()
                main.postDelayed(this, MIN_POLL_MS)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        prefs = TrackingPrefs(this)
        store = LocationStore(this)
        createChannels()
        SyncWorker.schedule(this)
        connectivity = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        try {
            connectivity.registerDefaultNetworkCallback(networkCallback)
            networkRegistered = true
        } catch (_: Exception) {}
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            trackingActive = false
            prefs.enabled = false
            stopSelf()
            return START_NOT_STICKY
        }
        if (!prefs.enabled || !prefs.sharing || prefs.activeTeam.isEmpty() ||
            prefs.token(prefs.activeTeam) == null ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) !=
              PackageManager.PERMISSION_GRANTED) {
            prefs.enabled = false
            trackingActive = false
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            ServiceCompat.startForeground(
                this, GPS_NOTIFICATION, trackingNotification(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            )
            trackingActive = true
            configureInterval(TrackingPolicy.MOVING_INTERVAL_MS)
            main.removeCallbacks(requestTicker)
            main.post(requestTicker)
            main.removeCallbacks(alertTicker)
            main.post(alertTicker)
            SyncEngine.kick(this)
            return START_STICKY
        } catch (_: SecurityException) {
            trackingActive = false
            prefs.enabled = false
            stopSelf()
            return START_NOT_STICKY
        }
    }

    private fun capture(location: Location, force: Boolean = false) {
        if (!prefs.enabled || !prefs.sharing ||
            !TrackingPolicy.acceptableAccuracy(location.accuracy)) return

        val nowElapsed = SystemClock.elapsedRealtime()
        val previous = lastFix
        if (previous != null && TrackingPolicy.meaningfulMovement(
                location.distanceTo(previous), location.accuracy, previous.accuracy)) {
            movingAt = nowElapsed
        }
        lastFix = location
        val newInterval = TrackingPolicy.intervalForStationary(nowElapsed - movingAt)
        if (newInterval != interval) configureInterval(newInterval)

        val prevStored = lastStored
        val needsStore = force || prevStored == null || TrackingPolicy.shouldStore(
            location.distanceTo(prevStored), location.accuracy, prevStored.accuracy,
            nowElapsed - lastStoreElapsed
        )
        if (!needsStore) return
        val team = prefs.activeTeam
        val member = prefs.member(team)
        if (team.isEmpty() || member.isEmpty()) return
        val captured = location.time.takeIf {
            it in (System.currentTimeMillis() - 7L * 86_400_000)..(System.currentTimeMillis() + 60_000)
        } ?: System.currentTimeMillis()
        try {
            store.add(team, member, location.latitude, location.longitude, location.accuracy, captured)
            lastStored = location
            prefs.lastFixAt = captured
            lastStoreElapsed = nowElapsed
            SyncEngine.kick(this)
        } catch (_: Exception) {
            // SQLite failure must not be mistaken for a successfully stored fix.
        }
    }

    private fun configureInterval(millis: Long) {
        if (interval == millis && registered) return
        if (registered) fused.removeLocationUpdates(callback)
        interval = millis
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, millis)
            .setMinUpdateIntervalMillis(minOf(millis, 10_000L))
            .setMaxUpdateDelayMillis(millis)
            .build()
        try {
            fused.requestLocationUpdates(req, callback, Looper.getMainLooper())
                .addOnSuccessListener { registered = true }
                .addOnFailureListener {
                    registered = false
                    trackingActive = false
                    prefs.enabled = false
                    stopSelf()
                }
        } catch (_: SecurityException) { registered = false }
    }

    private fun pollRequests() {
        if (!prefs.enabled || !prefs.sharing) return
        SyncEngine.checkLocationRequests(this) { requester ->
            main.post {
                if (!prefs.enabled || !prefs.sharing) return@post
                showRequestNotification(requester)
                try {
                    fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
                        .addOnSuccessListener { fix -> if (fix != null) capture(fix, true) }
                } catch (_: SecurityException) {}
            }
        }
    }

    private fun createChannels() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(
            GPS_CHANNEL, getString(R.string.tracking_channel), NotificationManager.IMPORTANCE_LOW
        ))
        nm.createNotificationChannel(NotificationChannel(
            ALERT_CHANNEL, getString(R.string.alert_channel), NotificationManager.IMPORTANCE_HIGH
        ))
        nm.createNotificationChannel(NotificationChannel(
            SOS_CHANNEL, "URGENT · Hunter needs help", NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Urgent Need Help messages from other hunters in your team"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 650, 180, 650, 180, 1000)
            setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        })
        nm.createNotificationChannel(NotificationChannel(
            MOOSE_CHANNEL, "Moose sightings", NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Bull and cow moose spotted by other hunters on your team"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 320, 140, 320)
            setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
        })
    }

    private fun trackingNotification(): android.app.Notification {
        val open = PendingIntent.getActivity(this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1,
            Intent(this, TrackingService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, GPS_CHANNEL)
            .setSmallIcon(R.drawable.ic_spectra)
            .setContentTitle("Spectra pocket GPS is on")
            .setContentText("Tracking your route with the screen off · tap to open")
            .setContentIntent(open)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(android.R.drawable.ic_media_pause, "Stop tracking", stop)
            .build()
    }

    private fun showRequestNotification(requester: String) {
        val open = PendingIntent.getActivity(this, 2,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val note = NotificationCompat.Builder(this, ALERT_CHANNEL)
            .setSmallIcon(R.drawable.ic_spectra)
            .setContentTitle("Spectra location requested")
            .setContentText(requester.take(28) + " requested your location. Responding automatically.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(4812, note)
    }

    private fun deliverHunterAlerts(team: String, alerts: List<SyncEngine.HunterAlert>) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val current = TrackingPrefs(this)
        val clearedAt = alerts.filter { it.kind == "help_clear" }
            .groupBy { it.author }.mapValues { (_, v) -> v.maxOf { it.created } }
        for (alert in alerts) {
            if (current.activeTeam != team || !current.enabled) return
            if (current.hasSeenAlert(team, alert.id)) continue
            val tag = "spectra-help-" + team + "-" + alert.author
            if (alert.kind == "help_clear") {
                manager.cancel(tag, 1)
                current.markAlertSeen(team, alert.id)
                continue
            }
            if (alert.kind == "help" && (clearedAt[alert.author] ?: 0L) >= alert.created) {
                current.markAlertSeen(team, alert.id)
                continue
            }
            if (alert.kind == "help" || alert.kind == "pin") {
                val urgent = alert.kind == "help"
                val title = if (urgent) "🚨 NEED HELP · " + alert.authorName.take(28)
                    else if (alert.markerIcon == "bull") "🫎 Bull moose spotted!"
                    else "🫎 Cow moose spotted!"
                val body = if (urgent)
                    alert.authorName.take(28) + " needs assistance. Open Spectra for their last reported location."
                    else alert.authorName.take(28) + " marked a moose on your hunting map. " +
                        alert.body.take(80)
                val open = PendingIntent.getActivity(this,
                    (alert.id.hashCode() and 0x7FFFFFFF),
                    Intent(this, MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                    },
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                val channel = if (urgent) SOS_CHANNEL else MOOSE_CHANNEL
                val note = NotificationCompat.Builder(this, channel)
                    .setSmallIcon(R.drawable.ic_spectra)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                    .setContentIntent(open)
                    .setPriority(if (urgent) NotificationCompat.PRIORITY_MAX
                                 else NotificationCompat.PRIORITY_HIGH)
                    .setCategory(if (urgent) NotificationCompat.CATEGORY_ALARM
                                 else NotificationCompat.CATEGORY_EVENT)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setAutoCancel(true)
                    .build()
                if (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(
                        this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                    if (urgent) manager.notify(tag, 1, note)
                    else manager.notify("spectra-sighting-" + team + "-" + alert.id, 2, note)
                    current.markAlertSeen(team, alert.id)
                }
            }
        }
    }

    override fun onDestroy() {
        trackingActive = false
        main.removeCallbacks(alertTicker)
        main.removeCallbacks(requestTicker)
        if (registered) fused.removeLocationUpdates(callback)
        if (networkRegistered) try {
            connectivity.unregisterNetworkCallback(networkCallback)
        } catch (_: Exception) {}
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
