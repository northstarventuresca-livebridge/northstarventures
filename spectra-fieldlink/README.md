# Spectra FieldLink — hunting communication app

## Deployed preview — November 11, 2026
- Live: https://fieldlink.northstarventures.ca
- Source: NorthStar GitHub `northstarventuresca-livebridge/northstarventures`, branch `feature/spectra-fieldlink`, file `spectra-fieldlink/worker.js`.
- Cloudflare Worker `spectra-fieldlink`; separate D1 database `spectra-fieldlink`. Existing unrelated services were not modified.
- Web PWA: browser installation / Add to Home Screen works where supported; native Android application has NOT been built.

## Maps
- Three persisted online map modes: **Hybrid** (Esri satellite imagery + Esri World Transportation roads and places reference layers), **Satellite**, and **Road map** (OpenStreetMap).
- Site-specific cutlines and ATV/quad trails may be visible in satellite imagery but not every informal track is in the mapped road data.
- GPS auto-centers the map on the first authorised GPS fix; later updates refresh hunter location without unexpectedly moving the map.
- All satellite imagery, roads and labels are attributed. Esri World Transportation raster overlay is a legacy service scheduled for retirement in 2028; before wider commercial release, replace with an appropriately licensed vector map provider.
- Online tiles only; **downloadable offline terrain/satellite maps are not yet supported**. Do not bulk-harvest OSM/Esri map tiles for offline use.

## Invite-only hunter identities
- Public team creation and shared-secret sign-in disabled. The demo UI remains publicly viewable; **actual private team data requires an individual registered member token**.
- One founder registration invite (single-use for captain access) was issued for the private `SPECTRAHUNT1` team, named `Spectra Hunting Team`. **Never put full unredeemed invite URL or bearer tokens in GitHub.**
- Existing hunter can tap **Team → Invite another hunter** to create a reusable 24-hour invitation link. Any number of invited hunters can register through that link before it expires. Invitee opens link in a phone browser, enters name (2–28 characters), selects one of eight hunter colours, then registers.
- Registration persists a 192-bit random bearer token in browser storage; only its SHA-256 hash is in D1. Server validates that identity for every team event and ignores client-supplied author/name/colour for impersonation prevention.
- The single-use invite token is only a bearer invitation: whoever opens it first can redeem it. There is not yet email/phone-based person verification, password recovery, or multiple-device login. Clearing browser app data may require reinvitation.
- Server-only registered hunter can send messages, GPS, map pins and create invites; marker modification requires the registered author identity, not possession of the group link.

## Field features
- Hunter icons are small coloured walking figures with names and last known GPS ages. Server persists last location, hunter colour and current Need Help status.
- While web app is active and permission is given, GPS updates on movement and periodically; **no reliable background/locked-phone GPS** until native app.
- **Request GPS** sends a targeted event; the recipient's currently visible, permission-enabled app can answer, but a switched-off / unreachable phone or radio cannot be remotely located.
- Map markers: cow moose, bull moose, buck, doe, hunter; eight colours; server owner-authorised edit/delete.
- Messages, quick responses, GPS, SOS and map markers are stored in D1 for cellular-connected hunters.
- Cow/bull moose and Help events from other hunters cause in-app alert with repeating supported vibration until dismissed, **only while web app is active**. Locked-screen alerts / wake behaviour are pending Android-native development.
- Auto / LoRa / Cellular UI present, but LoRa and LoRa-to-cellular relay **are not functional yet**.

## Architecture / next milestones
- Planned: Android app ↔ Bluetooth ↔ ThinkNode M1 ↔ 915 MHz Meshtastic LoRa ↔ other hunters; internet-connected hunter's paired Android app acts as an opt-in LoRa/cellular bridge with event IDs, dedup, acknowledgments and retries.
- Planned: licensed offline satellite/topo vector/raster maps on Android, a secure account recovery method, robust background tracking, location request delivery in background, hardened notifications and end-to-end encryption.
- Hardware field tests require the two ThinkNode M1 915 MHz nRF52840 units and Canadian-compliance verification.

## Tests
- New app loaded from root domain after cache refresh: 27/27 hybrid map tiles and road/label overlays loaded in mobile-sized browser; all three modes present.
- Invite-only signup tested on temporary QA team: one hunter registered using link, generated a new invitation; second user registered separately with custom colour; both appeared on one team roster. QA records deleted.
- Founder's private invite was validated against the live service without redeeming.
- Previous tests: demo map pins created/edited/deleted, blinking SOS, test moose alert dismissed; cellular SOS persistence verified in D1.
- Not yet verified on real phones with radio hardware, outdoor GPS reception, actual closed-app/lock-screen reliability or end-to-end encrypted transport.

**Safety:** This is a beta, not a substitute for a satellite SOS device or emergency communicator.

## Invitation policy update — November 11, 2026
- Team → Invite another hunter now generates a **reusable 24-hour invitation URL**. Anyone possessing the URL can register a distinct hunter name, colour, and bearer token before expiry.
- A reused hunter invite **does not become invalid on first registration**. Each registration gets a unique `hunter_members.invite_hash` to satisfy the original unique index. `hunter_invites.used_at` stays NULL for hunter links.
- The existing unredeemed invite for `SPECTRAHUNT1` was reset to a 24-hour expiry starting from the deployment (2026-11-11). The originally redeemed captain invite remains single-use to protect the captain role.
- Registration API checks expiry at submission, not just at page display. Expired links are rejected.
- Verified live against isolated QA data: two separate hunter registrations using identical URL both succeeded; after expiry the signup page disabled registration. Temporary QA team/accounts cleaned up.
- **Security note:** Whoever possesses a reusable invite URL can join during the 24-hour period, including unintended recipients if forwarded. Do not post the link publicly.

## GPS interval and permission controls — November 11, 2026
- Under **Setup**, a persisted slider controls GPS sampling/possible location broadcasts: 15s, 30s, 1m (default), 2m, 5m, 10m, 15m, 20m, or 30m.
- Optional (default on) stationary battery saver suppresses broadcasts when <30m movement until at least 15m has elapsed; updates only occur on the configured sampling interval. Manual location requests bypass the normal rate limit while open and permission granted.
- GPS sampling uses one `getCurrentPosition` per selected interval instead of a continuous high-accuracy watch. Position polling pauses while the app is hidden. An in-flight GPS result cannot transmit after the app is hidden.
- At startup and when returning to the foreground, the browser Permissions API is checked if available. When permission is absent/blocked, a visible in-app explanation prompts the user to allow location or change site settings. Granting permission starts live GPS if sharing is enabled. Sharing can be paused independently.
- Real Android lock-screen/background GPS still requires native implementation. Web GPS availability, energy savings and permission behaviour vary by device and browser.

## Browser background notifications — November 11, 2026
- Implemented web push through Cloudflare Worker and Android-compatible service worker, backed by per-hunter D1 subscription rows and a dedicated P-256 VAPID keypair stored in Cloudflare Worker secret bindings (not in GitHub).
- Under **Setup → Background phone notifications**, hunter can grant notifications, register this phone for background push, and trigger a local Android notification test. Subscription binds to the registered hunter identity and team; other team members receive pushes for **chat messages, cow/bull moose markers and NEED HELP** events, but the sender is excluded. Position updates and other marker types do not push.
- A push wakes the service worker, which retrieves a pending event over HTTPS via its browser-held push authentication secret and displays a system notification. Tapping it opens the map or team chat. Events are delivered to the browser push provider as empty VAPID-authenticated pushes; event content is fetched from FieldLink's own team server.
- Browser push relies on Android/Chrome's push service and phone internet connection; it does not require a continuously active tab. Notifications and vibration respect Android permissions and settings, and **continuous repeating vibration / guaranteed on-lock-screen pop-up requires native Android code**.
- Test status: Worker successfully deployed and VAPID secrets confirmed present; public key endpoint returned 200 with valid-length key; new Setup controls and service worker support detected in a mobile-sized browser. Browser in the test environment denies notifications, so actual Android closed-app delivery must still be confirmed by a user with an installed/allowed PWA and a second hunter account.
- No background LoRa / Bluetooth gateway functionality is implemented yet; web pushes will not arrive without internet.

## Background push notifications — 2026-11-11 (FieldLink v25)
- Browser push service is now deployed. Each team member opts in on their phone under **Setup → Enable phone alerts** (requires Chrome/compatible browser, service worker, Android notification permission, network).
- Cow/bull moose map pin, NEED HELP, and team message events enqueue per-subscriber outbox records and dispatch authenticated VAPID Web Push to all registered devices of other members of the same team; sender is excluded.
- Push endpoint is linked to authenticated hunter account; pending notifications are fetched by the service worker using the browser's push subscription auth material (hashed in D1). Pushing a notification does not expose the team secret or bearer token to the push provider.
- Tapping alert opens FieldLink map or chat. SOS notifications use high urgency and request persistent display/vibration, but **Android determines actual vibration/lock-screen behaviour**. The web app cannot guarantee continuous vibration until dismissed. Internet is still required; no off-grid LoRa alerts yet.
- VAPID key pair remains in Cloudflare Worker secret bindings, not GitHub. D1 tables `fieldlink_push_subscriptions` and `fieldlink_push_outbox` were created.
- Found and fixed a startup regression before release: the new Setup UI must retain the original `testSighting` button referenced by the main app startup event wiring. Isolated QA Worker verified startup on 390px and 733px displays (map 27/48 tiles) and in-app test/closing before promoting to live.
- Live verification: status Available, Hybrid map loaded on phone + Fold, push public key endpoint HTTP 200, service worker push/click event handlers loaded, anonymous subscription denied HTTP 401, in-app moose alert works, chat controls unaffected.
- **Still needs real-device acceptance test:** A hunter enables notifications and another team member marks moose or presses NEED HELP, with receiving Android phone locked and app closed. Browser Rendering test device denies notification permission and cannot validate actual FCM delivery or vibration.

## Notification icon and installed-app UX — November 11, 2026 (v26)
- Push notifications now use separate, **round PNG artwork** with transparent corners: moose spotting (green moose), NEED HELP (red warning), team message (blue chat). Each has a white transparent **72x72 PNG Android status-bar badge**, replacing the old square SVG logo.
- All image routes are served by the same Worker as generated indexed PNG files: `/notify/moose.png`, `/notify/help.png`, `/notify/message.png`, and matching `-badge.png` variants. The PWA manifest also selects the round moose icon for installation, with SVG fallback. Notification service worker cache bumped to v26.
- Setup → Install FieldLink card now hides whenever launched in installed standalone/fullscreen display mode or Android app context. Additionally listens for `appinstalled`, remembers completed in-browser installation, and where available uses `navigator.getInstalledRelatedApps()` with self-registration in `manifest.webmanifest` to check an already-installed PWA in Chrome.
- Limit: browsers without standalone display mode or Get Installed Related Apps support cannot always discover an installation launched in another browser, and an already installed home screen logo can remain cached by Android until refreshed.
- Tested in isolated staging Worker and after production deployment: all six image endpoints returned valid PNG at 192x192 or 72x72; transparent corners/visible centres verified; live map, messaging and Team tabs loaded at phone and Fold viewport sizes; simulating the install event hid Setup install card; latest SW points to event-specific icon and badge routes.

## Private map markers, map visibility and full-screen mode — November 11, 2026 (v27)
- Marker editor adds **Private marker — only I can see this**, default off for new pins. Hunter can edit the privacy flag on their own existing markers; private pins have a lock indicator on the marker list and popup.
- D1 `events.is_private INTEGER NOT NULL DEFAULT 0` with index. Authenticated events GET SQL returns an event only when `is_private=0 OR author=authenticated_member_id`. This is **server-side privacy** (private data never sent to other hunter accounts), not just CSS hiding; the Cloudflare backend can still store/read it.
- Private moose markers **do not dispatch push notifications** to teammates. Editing a shared marker to private clears pending push outbox rows; pending push endpoint also filters `e.is_private=0`. Already delivered phone alerts cannot be recalled.
- Persisted **Hide others' marks** toggle above map modes, plus synchronized toggle in full-screen. It hides only other hunters' *pins*, not people/GPS/SOS icons, and never changes shared/private storage.
- Bottom-right **Full screen** map button expands map to viewport and uses Fullscreen API with CSS fallback. Explicit **✕ Exit full screen** control, plus Escape/OS full-screen exit support. Map invalidates Leaflet size on entry/exit.
- Tests in isolated Cloudflare Worker and live production: 390px portrait, 733px Fold portrait and 1024px landscape showed map filling exact viewport and successful exit; demo own marker remained visible when filtering others' marks; team member A could create private pin unavailable to member B, while public pins remained visible; B's attempted edit returned HTTP 403; editing to private/re-sharing reflected immediately in server results.
- Existing marker privacy defaults to shared and existing messages/GPS/help stay unchanged. Isolated QA team and Worker were cleaned up.

## Fading GPS movement trails — November 11, 2026 (v28)
- A new D1 table `gps_trail_points` stores each hunter's **15 most recent meaningful GPS positions**, using the existing signed-in GPS position submissions. Trailing samples for each hunter are trimmed on insert; no added location polling or background GPS tracking.
- The backend ignores GPS fixes under a movement threshold of **65 metres or 1.2× combined accuracy uncertainty**, whichever is greater, and does not log a trail sample when location accuracy is over 150 metres. Thus stationary jitter does not produce location blobs. The raw current GPS indicator/presence remains unaffected.
- API response `/api/events?team=...` includes `gps_trails` alongside members and current locations, scoped to that authenticated hunting team. All hunters' movement trails are visible to team members only when the existing sharing has sent position updates. No private map pins affected.
- Leaflet renders thin rounded polyline segments in each hunter's jacket colour, fading from faint/older to brighter/recent, with gradually thicker head and a small directional arrow for sufficiently long recent segments. Trails are suppressed unless at least two meaningful points cover **75 metres or more**.
- Important: trails represent the latest *reported* significant position history, not continuous background tracking. No phone background GPS collection is implemented; browser remains foreground-only.
- Tests: in isolated staging, injected 15 near-identical simulated GPS points produced zero trails, while 15 separated movements generated 28 faded polyline paths plus one directional arrow on both regular Android-sized and Fold views. Server test inserted 10 jitter points (retained one) then 20 110m steps (retained exactly 15), and ignored an inaccurate fix. Live browser tests confirmed map, chat, push, full-screen, authenticated API gating and layout; no live hunter data used for the test.

## Rolling 30-minute GPS trails and map tools — November 11, 2026 (v29)
- Replaced the previous last-15-samples trail with a rolling **30-minute GPS movement window** (up to 180 stored significant fixes per hunter as a safety limit, above the maximum 120 reports possible at a 15-second interval). Older fixes are excluded from API reads and removed on the hunter's next location update.
- Retained the 65m/accuracy-based stationary jitter filter; if all points are stationary or the last movement is older than 30 minutes, no trail appears. Recent path segments keep a faded, directional style, with opacity reflecting recency.
- Field tools now display **Mark spot** and **Show all hunters** in a two-column layout. The obsolete **Move hunter** action is only shown in demo mode, relabeled **Simulate hunter movement (demo)**. In a registered hunting team it is hidden.
- Staging verified on 390×844 and 733×1536 displays: >30-minute trails rendered zero lines; recent points displayed six faded segments and an arrow; stationary jitter rendered zero lines. Live checks verified internet, hybrid map tiles, chat, push controls, fullscreen, API auth gate, v29 worker and corrected labels.

## Private daily GPS trek reports — November 11, 2026 (v30)
- Added `gps_day_history` D1 table, indexed by team/member/timestamp; **every successfully received GPS position event** stores a separate daily record without the 30-minute trail retention. Captured phone timestamp is preserved when queued/offline positions eventually sync, within a bounded plausible window. Unique event ID prevents duplicate GPS reports on retries.
- Added **Setup → My Daily Trek** with calendar and **View my daily trek**. Opens full-screen hybrid-satellite Leaflet route map with faded travel path, START/FINISH points, recorded distance estimate, number of GPS fixes, tracking span, and segment count. A selected day uses the phone's local calendar boundaries, including DST transitions.
- Daily trek API `GET /api/trek?team=...&start=...&end=...` requires the existing per-hunter bearer token, and queries only that hunter's own GPS records. Team members cannot access one another's full-day history via this endpoint, even though recent real-time team tracking stays shared.
- The route processor rejects low-accuracy positions, stationary GPS drift, highly implausible speed jumps, and **does not connect gaps over 20 minutes**. Below 3 usable points, 2 travel steps, or 90 m of reliable movement, shows a prominent **Not enough GPS data** notice rather than a misleading route or distance.
- Reported distance is an estimate along reliable, sampled paths; **missing track sections do not count** toward recorded distance. It does not infer activity when the app was closed, location permission disabled, or GPS sharing paused. Stationary power-saving settings continue to reduce position transmissions.
- Tests on isolated QA Worker: 390×844 phone and 733×1536 Fold; 14 synthetic moving GPS points produced a ~1.04 km fade route, 39 minute span, 13 map polylines, correct start/end, and modal close. One-point and stationary data produced no route; long gaps produced separate segments and warnings. D1 sample insert/select/delete verified member partitioning and cleanup. Live production startup verified hybrid imagery, chat, notifications, controls, v30 cache, and unauthenticated trek requests returning HTTP 401.

## Green wildlife sighting glow — November 11, 2026 (FieldLink v31)
- Green (`#B7EA84`) **cow/bull moose and buck/doe** markers now render a translucent expanding green glow for their first **45 minutes** since the saved marker creation time; then glow is removed while the original marker remains.
- The map uses three concentric, blurred translucent Leaflet circles to provide a gentle expanding halo without obstructing map gestures, hunter icons or clickable pins. It recalculates radius against the marker's server timestamp during regular map refresh.
- For the visual *illustrative* walking-pace model, moose uses 2.0 km/h (~1.5 km maximum model radius at 45m) and deer uses 2.5 km/h (~1.9 km radius at 45m). These are not measured actual animal speeds or a scientifically bounded location predictor. Animals might stay still, double back, run quickly, or move beyond the ring; the map popup explicitly states uncertainty.
- Non-green markers, green hunter-person pins and markers hidden by **Hide others' marks** do not display the glow. Existing private-marker privacy remains server-enforced.
- Sighting editor displays a short explanation when a green deer/moose marker combination is selected. Popup includes minutes since sighting and approximate illustrative radius.
- Tested in isolated staging with temporary markers: 10-minute green moose radius 333m, 40-minute 1,333m, green deer 10-minute 417m; no glow after 46 minutes or for orange deer/green hunter or other hunters' hidden markers. Original marker remained visible after glow expiry. Both 390×844 phone and 733×1536 Fold passed. Production v31 verified maps, messages, notifications, private marker editor, Daily Trek, map fullscreen and no horizontal overflow.
