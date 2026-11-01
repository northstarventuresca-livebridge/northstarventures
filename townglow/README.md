# TownGlow — Canada-wide community event map

Live preview: https://townglow-community-map.northstarventures-ca.workers.dev/

## Features
- MapLibre + OpenFreeMap interactive map (Leaflet fallback)
- Works throughout Canada, with map browsing beyond Canada
- Search **any Canadian city, town, neighbourhood, or address** using Natural Resources Canada's current **GeoLocator API** (https://geolocator.api.geo.ca), with optional search suggestions and selected-location labels
- Automatic browser geolocation on load, *with browser permission*, and a manual "Use my current location" button; GPS location isn't saved or sent to TownGlow's backend
- Quick-jump links for cities across provinces
- Independent Halloween, Christmas, Spring, and Community themes
- 1–5 stars, 250-character comments and timestamped *private browser drafts*
- Per-event and map-viewport public spot query in a dedicated Cloudflare D1 database
- Owner-consent and moderator-approval gates for community reviews

## Deployment
Cloudflare Worker `townglow-community-map` in the Northstar Ventures account, D1 binding `DB` points to `townglow-community-map-db`. Deployments are stored on the `townglow-community-map` GitHub branch, separate from the existing Northstar main site.

## Community publishing is not yet enabled
Google OAuth still needs **GOOGLE_CLIENT_ID**, **GOOGLE_CLIENT_SECRET**, **SESSION_SECRET**, and **ADMIN_EMAIL** set in TownGlow only (not reused from other projects). OAuth callback: `https://townglow-community-map.northstarventures-ca.workers.dev/auth/callback`. Moderation workflows and owner consent verification must be completed before publishing private-home listings.

The government Canadian GeoLocator service is keyless for typical public usage, with caching in the Worker. Public map rendering uses OpenFreeMap and OpenStreetMap data. A map tap selects geographic coordinates, not an independently confirmed civic address or specific house polygon. Do not advertise comprehensive house-by-house coverage until reliable building/address data and consent processes are added. The backend's coarse Canada bounding box is not a legal border-validation service.
