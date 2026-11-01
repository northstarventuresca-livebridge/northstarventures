# TownGlow — Sherwood Park community event map

Isolated Northstar Ventures Cloudflare Worker: `townglow-community-map`

Cloudflare deployment: https://townglow-community-map.northstarventures-ca.workers.dev/

### Current preview
- Responsive map of Sherwood Park using Leaflet and OpenStreetMap (attribution included)
- Four independent theme tabs: Halloween, Christmas, Spring and Community
- Map tap to select a spot; 1–5 star rating, 250-character comments, timestamped private browser drafts
- Neighbourhood navigation and local saved-address search
- Dedicated D1 database (`townglow-community-map-db`), no data shared with any other Northstar project
- Backend routes for Google OAuth, community nominations, moderated reviews, and admin-only moderation
- Public listings require verified homeowner consent
- **Before public launch:** set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ADMIN_EMAIL`. Configure Google OAuth redirect URI `https://townglow-community-map.northstarventures-ca.workers.dev/auth/callback`. Then expose submission UI.
- **Important:** currently demo/private-draft mode until OAuth credentials and public moderation UI are configured. Map click selects a coordinate, not a verified civic address or building parcel. For large-scale search, add a licensed geocoding service; don't use community-funded Nominatim as an unrestricted production search service.
- Third-party fonts, Leaflet CDN, and OSM tiles require network. Review map-tile capacity/license before a public traffic campaign.

To deploy: use Wrangler to publish `worker.js` from this folder and bind a D1 database as `DB`. Keep backend secrets in Worker secrets, **never** in GitHub. Branch created separately to avoid changes to Northstar main site.
