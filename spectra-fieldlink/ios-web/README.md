# Spectra FieldLink — iOS Web Development

## Purpose
This is the **separate Apple/web development branch** for Spectra FieldLink. It begins with the currently deployed FieldLink interface and backend, but is configured for browser access on iPhone/iPad with **isolated staging data**. Production Android remains independently deployed and unchanged.

## Environments

| Environment | Cloudflare worker | Database |
| --- | --- | --- |
| Current production Android | `spectra-fieldlink` | Production D1 (do not modify from this branch) |
| Apple browser development | `spectra-fieldlink-ios-dev` | `spectra-fieldlink-ios-dev` (isolated, empty staging records) |
| Read-only promotional demo | `spectra-fieldlink-demo` | None (fictional samples only) |
| Frozen production source backup (Nov 14, 2026) | `spectra-fieldlink-prod-snapshot-20261114` | No bindings, public access disabled |

**Browser test URL:** https://spectra-fieldlink-ios-dev.northstarventures-ca.workers.dev

## Current scope
- Original FieldLink interface, maps, teams, chat, wildlife markers, SOS and trail features cloned.
- iPhone Safari web access enabled **only** in the development Worker. The production Android-only browser gate remains intact.
- Separate database with production *schema only* (tables/indexes, **zero real hunter or team records**).
- Live Android sessions, Google Play testing tracks and prod Worker/routes remain untouched.
- Web browser location is **foreground-only** and must not be represented as reliable background hunting tracking.
- Native Android-only capabilities and Apple background GPS/push integration are **not yet implemented for iOS**.
- VAPID private key, hunter-deletion password secret and other production secrets were **not copied**.

## Source / deployment
- `worker.js` is the development Worker source corresponding to the deployed Apple web preview.
- `wrangler.jsonc` points **only** to the staging Worker and staging database.
- If deploying from the repository later, use the Wrangler config in this directory; **never** deploy this code using the root production configuration.
- This branch was created from `feature/spectra-fieldlink-play-store-20261112`. Do not merge its iOS-specific gate or staging configuration to Android production.

## Next checks
1. Open the preview on iPhone Safari and verify that the map/interface renders.
2. Create a **test** team; confirm sign-in, chat, map and marker interactions use staging records only.
3. Test browser GPS while the page remains foregrounded, keeping in mind that iOS suspends browser tracking in the background.
4. Build a native iPhone container with Core Location background updates and APNs before relying on FieldLink as a hunting safety tracker on iPhone.
5. Distribute through TestFlight after Apple Developer membership and iOS signing are ready.

**Verification:** Cloudflare accepted and deployed the staging Worker with the isolated D1 binding. External in-browser functionality on an actual iPhone has not yet been confirmed.
