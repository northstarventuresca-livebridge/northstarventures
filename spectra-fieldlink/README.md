# Spectra FieldLink — hybrid hunting communicator

## Current deployed preview (2026-11-11)
- Preview URL: https://fieldlink.northstarventures.ca
- Worker: `spectra-fieldlink` on NorthStar Cloudflare; isolated from existing apps.
- D1 database: `spectra-fieldlink`; private teams, stored cellular events (messages, one-tap texts, GPS updates, shared pins).
- Source: this repository's `feature/spectra-fieldlink` branch, `spectra-fieldlink/worker.js`.
- Installable mobile PWA. Interactive Leaflet map, **online tiles only**; demo mode clearly distinguished from live cellular.
- Strong random team secret (stored hashed in D1) required to read/write a group. Sharing that secret grants group access; individual accounts and end-to-end encryption are NOT yet implemented.
- Browser client supports queued cellular events when offline, retried when internet returns.
- Marker types: cow moose, bull moose, buck, doe, hunter; 8 selectable colours. Marker appearance and names can be edited later.
- New pins require a cryptographically random per-marker capability, stored only in the creator browser; the server verifies a SHA-256 hash for edits and soft-deletion. Group secret alone does **not** authorize others to delete. Pending edits/deletes queue locally when offline.
- Existing pins created before the per-marker key rollout cannot be securely attributed and remain read-only. Clearing browser storage loses marker editing capabilities. Future user accounts/device key recovery are needed for cross-device ownership.
- UI demo browser smoke-tested: 5 icon choices, 8 colours, add, edit and delete all passed. Mobile map tiles loaded (9/9). Full two-user live permission test remains pending. Queued events are device-local until uploaded.
- An online client polls events every seven seconds. No guarantee of timely delivery, radio retransmission, or emergency signaling.
- The UI's LoRa option and relay are **not yet functional**; Android-native BLE and offline map packs require separate implementation.
- Release check: Cloudflare deployment and D1 binding confirmed; browser rendering displays the Leaflet map and quick-message buttons. End-to-end two-device cellular sharing is not yet field-tested.

## Target hybrid architecture
```
Offline hunter's phone ↔ BLE ↔ ThinkNode M1 A
                              ⇣ 915 MHz Meshtastic LoRa
                       ThinkNode M1 B ↔ BLE ↔ Hunter B phone (internet)
                                                ⇣ HTTPS
                                         Cloudflare team API
                                                ⇣ HTTPS
                                        Remote hunter phones
```
- One team ID + identity, one event log, one map irrespective of transport.
- Modes: AUTO (prefer available transport and dedupe), LORA ONLY, CELLULAR/INTERNET ONLY.
- Gateway mode: a hunter's opted-in Android app, paired by BLE to an M1 while also online, translates LoRa events to secure Cloudflare API events and internet events back to the mesh.
- **Gateway radio and Bluetooth must remain functional**; an internet-only hunter can send cellular independently if M1 battery dies.
- Android foreground service + battery optimization guidance for BLE gateway; connectivity checks and explicit bridge status.
- Use a canonical event ID across radio and internet and a persistent seen-ID cache to dedupe and prevent loops. Avoid repeat rebroadcast; enforce bounded retries, hop limit/TTL, and per-sender send limits for low LoRa airtime usage.
- Privacy: default private Meshtastic channel and team secret; no public Meshtastic MQTT broker for private location tracking. Server-side D1 currently stores plaintext; add E2E encryption and proper individual identities prior to wide rollout.
- If considering Meshtastic built-in MQTT proxy, it is an alternative radio-to-internet path (with phone network) that may reduce custom Bluetooth bridge complexity, but should be assessed carefully against FieldLink's unified per-team account/history requirements.
- Offline map: licensed downloadable map vector/terrain pack stored on Android (e.g. MapLibre/MBTiles), not bulk downloading OSM's public raster tile service. GPS and local markers work without network. Marker synchronization goes across LoRa or cellular as available.
- Radio protocol: compact `event_id`, event kind, author node ID, coordinates and short text in Meshtastic app data (within payload limits); do not send imagery/map tiles over LoRa.
- Test with two ThinkNode M1 nRF52840/915 MHz devices, check Canadian ISED compliance, pair one M1 per Android phone.

## Next verified milestones
1. Two-phone cellular team create/join, messages, map pins, GPS, and receipt tests on live site.
2. Native Android application scaffolding for BLE and offline map packages.
3. M1 BLE connection and Meshtastic packet send/receive.
4. BLE + cellular gateway bidirectional sync, dedup, queue, battery failure tests.
5. Field tests in Alberta terrain, offline topo packages, encryption and reliability tuning.

Never market this prototype as a replacement for an emergency satellite device.

## Hunter identities, SOS and sighting alerts (2026-11-11)
- The map now uses miniature walking hunter SVG characters instead of dots, with names above their heads and 8 selectable jacket colours.
- Each authenticated team (currently team-secret-based beta) has a persistent `hunter_presence` record: latest GPS, last contact time, colour, and active help flag. Help remains active across page refreshes and message-history trimming until the same apparent hunter clears it. **Per-member authentication/cryptographic identities are still required** before treating SOS control as tamper-resistant.
- With location sharing enabled (default on for newly joined users; browser prompts for permission), the **visible** web app watches the phone GPS and posts updates when movement reaches 30 m or the last transmitted fix is older than 45 seconds, subject to connectivity and OS constraints. It pauses tracking when the page is hidden.
- Hunter cards and map popups show last reported GPS age. A request-location action sends a target-addressed event. A receiving **open, visible app with GPS sharing enabled** responds with a new fix if browser permission and GPS are available. It does not wake a closed or locked app.
- A Need Help action posts a persistent server-side SOS status and triggers a blinking hunter/map banner, including "LOCATION UNKNOWN" when there is no usable position. Users can clear their own help status from their active browser. Delivery is subject to connectivity; not an emergency communication guarantee.
- Fresh cow/bull moose sighting pins from other hunters, and Help events, trigger an interruptive in-app modal. Where supported, vibration repeats every ~2.2 seconds while the app is visible until dismissed. Users can test the alert under Setup. Browser notifications require permission and do not provide guaranteed closed-app delivery or indefinite lock-screen vibration.
- Android-native follow-up: explicit foreground/background-location permissions, foreground service and consent, proper notification channel for important alerts, phone BLE connection, remote request routing across LoRa/cellular, autonomous radio GPS position broadcasts and reconciliation. Locked-screen delivery and vibration patterns must be tested against Android OS power/notification restrictions.
- **Safety:** a device without power, GPS fix, radio connectivity, or cellular coverage cannot be remotely located on demand. Show last-known position with timestamp rather than a fake live location. This is not a satellite SOS replacement.

## Validation
- Deployed to NorthStar Cloudflare Worker `spectra-fieldlink`.
- Mobile-sized browser test: 9/9 map tiles, 2 walking hunters with labels, 8 hunter colours, SOS blink/clear, moose alert dismiss.
- Live cellular beta: team creation and pin write verified in the database; SOS event submitted and confirmed in `hunter_presence` with `needs_help=1`.
- Two-user location request and closed-app notification not yet validated.
