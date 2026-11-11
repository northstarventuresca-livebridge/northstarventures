# Spectra FieldLink — hybrid hunting communicator

## Current deployed preview (2026-11-11)
- Preview URL: https://fieldlink.northstarventures.ca
- Worker: `spectra-fieldlink` on NorthStar Cloudflare; isolated from existing apps.
- D1 database: `spectra-fieldlink`; private teams, stored cellular events (messages, one-tap texts, GPS updates, shared pins).
- Source: this repository's `feature/spectra-fieldlink` branch, `spectra-fieldlink/worker.js`.
- Installable mobile PWA. Interactive Leaflet map, **online tiles only**; demo mode clearly distinguished from live cellular.
- Strong random team secret (stored hashed in D1) required to read/write a group. Sharing that secret grants group access; individual accounts and end-to-end encryption are NOT yet implemented.
- Browser client supports queued cellular events when offline, retried when internet returns. Queued events are device-local until uploaded.
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
