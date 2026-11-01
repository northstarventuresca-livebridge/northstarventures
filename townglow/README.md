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
- **Admin review of potentially harmful wording:** low star counts, accusation terms, personal information, and inappropriate language get a review flag. Every submitted review is pending moderation regardless of keyword matching. Moderators may edit wording before publication; published edits are labelled.
- **Residential safety rule:** ratings of 1 or 2 stars selected on a private residence are sent to a **general neighbourhood aggregate**; the server rejects publishing such ratings on that exact home.
- **Optional green / red / amber hotspot overlay** for more 4–5-star, more 1–2-star, or tied contributions. Only broad quantized neighbourhood cells (~1.5–2 km) are displayed, using approved neighbourhood contributions and approved individual place reviews. Require at least 5 different accounts and 3 different location keys for a cell.
- Neighbourhood submissions store only a coarsened cell, rating, user ID, and keyed hash of the source location; the exact original map tap is not stored in the public heatmap records. Private submission text is only for admin moderation and never appears in the hotspot API.
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
- Confirm public-space classifications before approving locations. A user could otherwise mislabel a residence as a public event.
- Heatmap signal thresholds reduce but do not eliminate re-identification, brigading, or abusive content risks. Public launch needs legal/privacy review, in particular for location-specific comments.
- Hotspot data intentionally remains empty until community submissions have been approved and the privacy threshold is met. Do not seed false ratings.
- The map click selects coordinates, not necessarily a civic address/building polygon.
- Review accessibility, privacy policy, terms, consent handling, age limits, spam-abuse controls, license/traffic capacity and account deletion before broad public marketing.
- No other Northstar app or database was altered.

## Schema
The complete schema is in `schema.sql` (deployed via D1 API).
