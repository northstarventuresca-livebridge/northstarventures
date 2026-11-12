package ca.northstarventures.spectra

import kotlin.math.max

/** Pure adaptive rules: do not pretend an inaccurate GPS jump is movement. */
object TrackingPolicy {
    const val MOVING_INTERVAL_MS = 15_000L
    const val AT_REST_INTERVAL_MS = 60_000L
    const val SLEEP_INTERVAL_MS = 180_000L
    const val STATIONARY_UPLOAD_MS = 15 * 60_000L

    fun intervalForStationary(stationaryMs: Long): Long = when {
        stationaryMs < 5 * 60_000L -> MOVING_INTERVAL_MS
        stationaryMs < 20 * 60_000L -> AT_REST_INTERVAL_MS
        else -> SLEEP_INTERVAL_MS
    }

    fun meaningfulMovement(distanceMeters: Float, accuracyMeters: Float,
                           previousAccuracyMeters: Float): Boolean {
        return distanceMeters >= max(20f, 1.25f * (accuracyMeters + previousAccuracyMeters))
    }

    fun shouldStore(distanceMeters: Float, accuracyMeters: Float,
                    previousAccuracyMeters: Float, elapsedMs: Long): Boolean {
        return meaningfulMovement(distanceMeters, accuracyMeters, previousAccuracyMeters) ||
            elapsedMs >= STATIONARY_UPLOAD_MS
    }

    fun acceptableAccuracy(accuracy: Float): Boolean =
        accuracy.isFinite() && accuracy > 0f && accuracy <= 150f
}
