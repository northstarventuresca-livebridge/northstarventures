# Polaris Android Companion (beta)

Pairs to the private Polaris Memory database with an expiring code.

- Arrival at a saved RONA or other store: location geofence (two-minute dwell), reads store reminders.
- Leaving a saved Home or arriving at a saved job site: reads active items to bring.
- Morning: inexact reminder alarm around 7 AM local time.
- Notifications include Snooze 15 minutes and Done for an individual reminder. Tap a notification for spoken read-back.
- Saved place coordinates stay only on the Android phone. Pairing keys are stored using Android Keystore AES-GCM.
- Requires user-granted fine location, background location, and notifications. Google Play Services required.
- Geofence delivery may be delayed or suppressed by Android battery restrictions. Force stopping disables alerts until reopening the app.

To test: create a pairing code at https://polaris.northstarventures.ca/memory, enter it in the APK, grant permissions and tap Test notification. Save location when physically at RONA or home. Debug APK is for testing only.
