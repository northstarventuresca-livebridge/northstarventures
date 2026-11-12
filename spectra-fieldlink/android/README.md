# Spectra FieldLink — Native Android field-test app

This is the **Android prototype** for multi-day hunting trips. The existing FieldLink web interface loads in a secured WebView; a native foreground **location** service persists independently of the screen and browser, while Android permits it to run.

## Functionality implemented in source
- Start/Pause **Pocket GPS** explicitly from native bottom bar; Android precise-location runtime permission and notification consent. Android shows an ongoing tracking notification with **Stop tracking**.
- Background GPS from Google Fused Location Provider; adaptive 15-second movement / 60-second rest / 180-second long-stop sampling, moving updates and 15-minute stationary heartbeats, with accuracy filtering.
- GPS fixes are stored **before** upload in private Android SQLite; every event has an idempotent UUID and original captured timestamp; independent team credentials remain encrypted in Android Keystore-backed preferences.
- Cellular/Wi-Fi re-sync automatically on new fixes, network return, and every 15 minutes via WorkManager. No silently dropping old fixes when disconnected.
- Incoming location requests are checked through the authenticated team API approximately every 45 seconds while tracking is active. Auto-response uses a fresh native GPS fix. Requests produce a phone notification if permission is allowed.
- Native/WebView bridge accepts messages only from the main frame at **https://fieldlink.northstarventures.ca**, and suppresses double-transmission by the webpage.
- Each linked team retains separate credentials and event IDs. Only the currently active team is tracked.

## Pairing
The PWA's browser storage is not shared with Android WebView. **Don't register duplicate hunters.**
Spectra website > Setup > **Generate phone link code**, then Android > **Pair phone**. The 8-digit single-use code expires after 10 minutes. Backend must be deployed before this can be used.

## Build
GitHub Actions: `Spectra Android test APK` builds a **debug** APK on branch pushes. No production release signing key or Play Store publishing configured. Current branch requires real-device acceptance testing.

## Critical Android boundaries
- Screen-off tracking works while the foreground location service is permitted/running; **Android can still terminate it**, including user force-stop, battery optimization, power saving, reboot, permissions revoked, or device shutdown. Do not claim uninterrupted safety coverage without multi-day phone testing.
- A foreground service must be started from a visible user action, not an arbitrary background push. The app does not auto-start tracking on first install or after a fresh reboot.
- Phone alerts for location requests use periodic authenticated polling while the tracking service is active. FCM native push is a future addition for immediate alerts with tracking off.
- Offline track uploads require a later successful data connection; while entirely off-grid other hunters will not receive updated phone positions until LoRa mesh radio integration.
- LoRa hardware/firmware communication is a separate development milestone; this app is currently cellular + offline storage only.
- Device-local SQLite is covered by Android filesystem encryption on supported phones, but is not SQLCipher-encrypted independently.
- This beta does **not replace** a satellite emergency communicator or personal locator beacon.

Test plan: pair existing hunter, Start GPS, walk 5 minutes with screen locked, verify points on server; airplane mode for 10 minutes while walking, restore internet and verify original GPS captured times; receive another hunter's location request while app closed, verify automatic fix; pause tracking and verify no further fixes; cross-team switch and ensure no queued points leak into the wrong team.
