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
