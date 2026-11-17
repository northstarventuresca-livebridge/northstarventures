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

## Version 0.2 — Smart Context beta
- Explicitly saved storage-unit geofence, with optional weekly conversational prompt.
- Conservative prompts: at most two proactive notifications per day, 9 PM–8 AM quiet period.
- Morning checklist **off by default**; if enabled, only shows entries due today.
- "Bring" reminders at departure or job-site arrival require due dates.
- Single follow-up about unresolved bring items approximately three hours after a reminder, subject to Android alarm delivery and quiet hours.
- From a reminder, tap "Check again in 3 days" to defer selected items in Polaris; done items remain complete.
- Privacy: location labels and coordinates remain stored on the phone. No health/SMS/camera permissions are requested.
- These alerts cannot prove an item was picked up. A completion acknowledgement determines its status.

Future staged integrations: optional learning of repeated unnamed stops, calendar and leave-time context, Health Connect, explicit selected-conversation capture, and consented camera event metadata. None of those sources is enabled or scanned in this beta.
