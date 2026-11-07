# Polaris ChatGPT → Live Display bridge (v2.5)

## Purpose
Use ChatGPT itself as the conversational assistant. Polaris at
**https://polaris.northstarventures.ca/display** is the separate visual viewer
on a phone, split-screen or future wall-mounted TV. This is **not** a second AI
chat session or an automatic mirror of all ChatGPT messages.

## What's implemented
- Existing `polaris-mobile` Worker and original dashboard at `/` preserved.
- `GET /display`: authenticated, responsive high-tech full-screen viewer.
- `GET /api/display-state`: authenticated, read-only state, private D1 source.
- Viewer polls every 2.5 seconds while open, updates project title, metrics,
  priorities, details and HTTPS links without reloading the page.
- Polaris access cookie remains required; no public write endpoint.
- User can open the visual display on a phone or TV. ChatGPT conversation
  remains in the official ChatGPT app or website.
- The viewer does not automatically receive the user's entire conversation,
  nor can the website directly access ChatGPT account memory. ChatGPT must
  issue a connected Cloudflare update explicitly for each display change.

## Connected resource identifiers
- Cloudflare account: Northstar
- Account ID: `de139270326790931c82df02d785528f`
- Existing Worker: `polaris-mobile`
- Polaris private D1 database ID: `c07cf5e5-1d25-4058-9814-9eb11030f0da`
- D1 table: `polaris_display_state` (single row `id='main'`)
- GitHub source: `northstarventuresca-livebridge/northstarventures`
- Worker source: `polaris/worker.js`
- Viewer source: `polaris/display.html` (embedded in Worker for deployment)

## Update a visual project from an active ChatGPT conversation
When the user says "Show LiveBridge on Polaris" or requests an updated
visual dashboard, research the facts with authorized tools, then use the
**Northstar Cloudflare connector** to run one parameterized D1 update.
Do not assume this happens without calling a tool. No background automation
runs when the ChatGPT conversation is idle.

SQL (parameterized; never string-concatenate user content):
```sql
UPDATE polaris_display_state SET
  revision=revision+1,
  view=?,
  project=?,
  title=?,
  subtitle=?,
  payload=?,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id='main';
```
Parameters: e.g.
```json
[
  "project",
  "LiveBridge",
  "LIVEBRIDGE · PROJECT STATUS",
  "Production summary and priorities.",
  "{\"metrics\":[],\"items\":[],\"details\":[],\"links\":[]}"
]
```

`payload` is JSON string. Shape:
```json
{
  "sectionTitle": "Next priorities",
  "metrics": [
    {"label":"ORGANIZATIONS","value":"11","note":"Verified production D1"}
  ],
  "items": [
    {"title":"Password login","detail":"Verify existing-customer process"}
  ],
  "details": [
    {"title":"Source","detail":"Production Cloudflare D1, last checked date"}
  ],
  "links": [
    {"label":"Project repository","url":"https://github.com/..."}
  ]
}
```

Viewer limits: 8 metrics, 12 items, 12 details, 8 links. Only HTTPS links
are rendered. The viewer uses `textContent`, not raw HTML.

## Safety and truthfulness
- Always distinguish factual live metrics from historical notes or demos.
- The bridge is **display-only**; it does not automatically implement
  website changes, send emails, or control Cloudflare/GitHub on its own.
- Do not copy credentials, emails, or sensitive records to display_state.
- Use read-only queries for verification unless the user separately authorizes
  source changes. Never modify the LiveBridge production data merely to test
  a display.
- API requires Polaris cookie auth, and the browser has no display-write route.
- Cloudflare connector must be available in the active ChatGPT conversation to
  issue updates; no implicit access to the user's other ChatGPT sessions.

## Verification performed
- 2026-11-06 (Alberta): Worker deployed at 100%, /health reported v2.5 online.
- Polaris /display unauthenticated browser request returned Secure Access page.
- Browser Rendering validated viewer markup and poll route.
- Seeded display with LiveBridge production counts obtained using read-only D1
  SELECTs: 11 organizations (all marked active), 270 recorded broadcasts,
  3 campus records, 1 organization with password-login enabled.
- Verified `polaris_display_state` revision incremented to 2.


## v2.6 — Four-project activity wall (November 6, 2026 Alberta time)

Activated via ChatGPT read-only connected Cloudflare accounts, state \`view='portfolio'\`.
The UI is in \`polaris/display.html\`, embedded into \`polaris/worker.js\`. The
authenticated /display page polls \`polaris_display_state\` for updates
(approximately every 2.5 s). This is a **dated verified snapshot**, not live
background synchronization from ChatGPT or simultaneous connected-user telemetry.

Payload shape: \`{"snapshotLabel":"CAPTURED ... UTC","cards":[{"name":"TapBin","glyph":"▣","url":"https://tapbin.ca/","metrics":[{"label":"...","value":"..."}],"trendLabel":"ADMIN AUDIT EVENTS","unit":"audited admin events","trend":[{"day":"2026-11-06","value":0}],"initialNote":"...","source":"..."}]}\`. Exactly four cards, three metrics each, 14 daily points each. Each bar is tappable to show the day and activity. Chart axes scale independently by project; never imply 1 broadcast equals 1 website view.

**Sources and current verified snapshot (14 complete UTC days Oct 24–Nov 6, 2026):**
- TapBin: NSV Cloudflare D1 \`northstar-organizer-saas-db\`. Count organizations from \`saas_users\` with \`role='organization'\`; \`saas_ai_usage.requests\` total; count items across workspace tables named \`w_[hex]_items\`; daily **admin audit** actions in \`saas_admin_audit\`, not every site action. At capture: 4 organizations, 372 items, 7 AI requests, 5 audited admin actions in the 14-day period. This is not 5 total user activities.
- LiveBridge: NSV Cloudflare D1 \`livebridge-db\`. \`organizations\` count; \`broadcast_sessions\` count; recent \`active_broadcasts\` last_seen heartbeat within 120 seconds; daily \`broadcast_sessions\` grouped by \`date(started_at/1000,'unixepoch')\` (milliseconds). At capture: 11 orgs, 270 all-time sessions, 0 recent rooms, 35 sessions Oct 24–Nov 6 UTC.
- Compass: NSV Cloudflare D1 \`songwriters-compass-db\`. \`users\`, \`songs\`, \`ai_call_logs\` totals; daily usage \`usage_events\` grouped by \`date(created_at,'unixepoch')\` (**seconds**, unlike LiveBridge). At capture: 3 users, 5 songs, 24 AI requests, 84 usage events on 14-day timeline; 3 distinct accounts seen in session history within 24h at capture.
- Great Church: Connected CHURCH Cloudflare zone \`greatchurch.ca\` (\`294caf2efc338acca23ff9f70be929d3\`) GraphQL \`POST /graphql/client/v4\`, \`viewer { zones(filter:{zoneTag:"..."}) {httpRequests1dGroups(limit:14,filter:{date_geq:"...",date_leq:"..."},orderBy:[date_ASC]){dimensions{date}sum{requests pageViews}uniq{uniques}}}}\`. In that period: **9,914 page views**, **60,717 HTTP requests**, and 744 page views on Nov 6 UTC. Counts are Cloudflare zone analytics, not confirmed unique human visitors; HTTP requests may include bots and resources. Do not sum daily \`uniq.uniques\` as cross-period unique visitors.

For future refreshes: query both Cloudflare accounts read-only, generate four dated metric cards and per-day arrays, then perform an authenticated connector D1 update only to \`polaris_display_state\`, incrementing revision. Never update the underlying TapBin, Compass, LiveBridge, or Great Church business data. Keep the website at / unchanged and preserve all Cloudflare Worker secret bindings upon code deployment.
