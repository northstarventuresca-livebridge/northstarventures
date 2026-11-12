package ca.northstarventures.spectra

import org.junit.Assert.*
import org.junit.Test

class TrackingPolicyTest {
    @Test fun movementRemainsFrequent() {
        assertEquals(15_000L, TrackingPolicy.intervalForStationary(0))
        assertEquals(15_000L, TrackingPolicy.intervalForStationary(4 * 60_000L))
        assertEquals(60_000L, TrackingPolicy.intervalForStationary(6 * 60_000L))
        assertEquals(180_000L, TrackingPolicy.intervalForStationary(23 * 60_000L))
    }

    @Test fun movementRejectsInaccurateJitter() {
        assertFalse(TrackingPolicy.meaningfulMovement(20f, 30f, 30f))
        assertTrue(TrackingPolicy.meaningfulMovement(35f, 5f, 5f))
        assertTrue(TrackingPolicy.shouldStore(0f, 5f, 5f, 15 * 60_000L))
        assertFalse(TrackingPolicy.shouldStore(0f, 5f, 5f, 60_000L))
        assertFalse(TrackingPolicy.acceptableAccuracy(200f))
        assertTrue(TrackingPolicy.acceptableAccuracy(10f))
    }
}
