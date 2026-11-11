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
