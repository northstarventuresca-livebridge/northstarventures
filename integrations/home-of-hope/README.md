# Home of Hope ↔ North Star Command Center (staging only)

**Status:** Not deployed. The live Home of Hope Hub has **not** been altered.

## Verified production integration target
- HOH HUB administrator site: `https://hoh.northstarventures.ca/`.
- Cloudflare Worker: `home-of-hope-microloans-preview` (despite the legacy "preview" name, its current custom-domain route serves the production HOH admin site).
- Separate public sponsorship site: `https://hohs.northstarventures.ca/`. Do **not** attach admin SSO to the public site.
- Existing HOH session: HTTP-only `hoh_session` cookie backed by the D1 `auth_sessions` table, ordinarily eight hours.
- Verified intended account: active developer **northstarventures**, super_admin, no forced password change. Never accept a username, user ID, role, or redirect supplied by the launcher/browser.

## Staged flow
1. Existing authenticated North Star admin session POSTs `/api/admin/launch/hoh` (same-origin).
2. North Star uses the **private Cloudflare Worker service binding** `HOH_SSO_RPC`; it never reads HOH database records or stores HOH credentials.
3. The HOH Worker named RPC entrypoint `NorthStarHOHLogin` checks its local active developer account and stores a SHA-256 hash of a **60-second, single-use ticket** in HOH's D1 database.
4. North Star returns the fixed HOH `/sso#ticket=...` URL. HOH's same-origin `/api/nsv-sso/redeem` atomically consumes it, verifies the owner is still active, and issues a **seven-day** `hoh_session` in HOH's own database.
5. The temporary ticket is removed from browser history before redemption; the normal HOH UI then loads. Existing HOH role/permission checks apply.

## Missing release work
- **This repository contains only the additive HOH Worker code**, not its live bundled source. The live Worker is deployed directly to Cloudflare. Retrieve and back up the *exact currently deployed Worker version* and integrate `hoh-sso-worker-addon.js` into it before releasing. Export the named entrypoint and dispatch `handleNorthStarHOHSSO(req,env,url)` for `/sso` and `/api/nsv-sso/redeem` **before** existing authentication/route handling. Recheck against the current source; don't overwrite intervening admin changes.
- Stage the assembled HOH Worker under a *different* Worker name first. Test with a fresh browser, concurrent/double ticket redemption, expired ticket, logout, disabled account, and unauthorized requests. Ensure staging cannot mutate live HOH data unexpectedly.
- Once the HOH named entrypoint is deployed, review North Star's `HOH_SSO_RPC` service binding and deploy North Star through the normal workflow.
- The current North Star admin is a **single-owner account**. Partner access must NOT use this route until per-user identity, independent app-level permissions, and card revocation are implemented.
- **Remote logout everywhere is not yet connected.** The HOH RPC includes `revokeOwnerSessions()` for a later central-session manager, but until the complete cross-app revocation flow is tested we must not promise the mobile button protects shared computers.
- User selected **one week** for all sessions including shared computers; preserve that choice for the *owner SSO session only* without weakening other HOH users' session policies. The ticket itself always expires after 60 seconds.
- Existing NTAG215 cards are **not card-only authenticators**. Never unlock HOH with an NFC URL alone. Implement trusted secure-card verification and one-time laptop QR authorization separately.

This staging work is intentionally fail-closed until both Workers have the corresponding trusted code.
