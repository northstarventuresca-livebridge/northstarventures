# TownGlow community experience map

Website: https://townglow-community-map.northstarventures-ca.workers.dev/
Admin: https://townglow-community-map.northstarventures-ca.workers.dev/admin

## Features
- Canada-wide city, neighbourhood and address search (Natural Resources Canada GeoLocator)
- GPS location with browser permission; location isn't stored on the server
- MapLibre/OpenFreeMap interactive base map
- Halloween, Christmas, spring, community and admin-approved custom themes
- Ratings: 1–5 stars, up to 250-character comments, browser-local private drafts
- TownGlow community accounts with unique usernames and PBKDF2-hashed passwords
- Google OAuth support ready to configure later (requires separate Google client ID/secret)
- New location submissions and reviews routed to admin review queue
- All residences require verified homeowner consent before listings become public
- Public area/event submissions still require admin approval
- Review and location reports, administrator removal, review approvals/rejections
- Suggested themes moderated and added dynamically after approval
- Public profile page/modals showing only *approved* reviews and timestamps; emails/private account IDs are not shown
- Private IP-derived, HMAC-hashed throttling keys for auth attempt limits

## Cloudflare deployment
Isolated Northstar Worker `townglow-community-map` and D1 `townglow-community-map-db`.
Worker secrets: `SESSION_SECRET`, `ADMIN_PASSWORD` and `ADMIN_EMAIL`. Do not commit their values.
Admin uses password sign-in option on the site's sign-in dialog; keep the password secure. Google OAuth admin sign-in also supported when configured and the verified Google email equals `ADMIN_EMAIL`.

## Google OAuth when ready
1. Create a Google Cloud OAuth client for web application.
2. Authorized redirect URI: `https://townglow-community-map.northstarventures-ca.workers.dev/auth/callback`
3. Set new Worker secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then test consent-screen production availability.

## Limitations / public launch checklist
- Username/password community accounts are **not verified identities**. No account recovery, email verification or MFA currently exists. Moderator review and server-side rate limits are in place, but do not treat usernames as real-world identity proof.
- Google/Facebook one-click sign-in is not active until provider credentials are configured.
- Private residential reviews and locations cannot be published without admin approval and homeowner consent.
- Confirm public-space classifications before approving locations.
- The map click selects coordinates, not necessarily a civic address/building polygon.
- Review accessibility, privacy policy, terms, consent handling, age limits, spam-abuse controls, license/traffic capacity and account deletion before broad public marketing.
- No other Northstar app or database was altered.

## Schema
The complete schema is in `schema.sql` (deployed via D1 API).
