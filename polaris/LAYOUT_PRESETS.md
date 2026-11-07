# Polaris: Saved layout presets

**Standing preference:** Once a layout has been requested or approved, save its design/instructions and **reuse it on future requests**. Refresh the data inside that existing design, instead of redesigning the frontend or redeploying the Cloudflare Worker every time.

## Permanent source of truth

- Cloudflare account: Northstar
- D1 database: `polaris-conversation-log` (`c07cf5e5-1d25-4058-9814-9eb11030f0da`)
- Saved layouts: `polaris_saved_layouts`
- User behavior preferences: `polaris_display_preferences`
- Current display: `polaris_display_state`, row `id='main'`
- Deployed frontend view implementations: `polaris/display.html`, embedded in `polaris/worker.js`
- Display URL: https://polaris.northstarventures.ca/display
- ChatGPT access via connected Northstar Cloudflare connector. Do **not** assume ChatGPT automatically issues tool calls outside active conversations.

## Saved layouts (as of November 6, 2026, Alberta)

| Layout key | Renderer view | Trigger |
|---|---|---|
| `four-project-activity` | `portfolio` | Four-project activity/usage wall: TapBin, LiveBridge, Songwriters Compass, Great Church |
| `livebridge-mission-control` | `mission` | LiveBridge activity telemetry and 14-day broadcast chart |
| `livebridge-live-site` | `website` | Display the verified live website livebridge.ca |
| `project-status` | `project` | General project status panel with metrics, next priorities and references |

All four are **already implemented in the deployed Polaris display**; recurring requests must not cause code changes.

## Retrieve and reuse

When the user asks for an existing layout:

1. Query its `definition_json` and `refresh_recipe_json` using the connected Cloudflare D1 query action (read-only).
2. If recent verified information is requested, query authorized project data read-only according to the recipe; otherwise reuse the available snapshot as a **dated snapshot**.
3. Update **only** `polaris_display_state` via the Cloudflare connector, using parameterized values:
```sql
UPDATE polaris_display_state
SET revision=revision+1,view=?,project=?,title=?,subtitle=?,
    payload=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id='main';
```
4. The authenticated display polls for the revision and rerenders the already-present view. **No GitHub edits or Worker deploy required**. Never present a snapshot as a continuously live feed.

For first-use designs, implement/verify the view once, save it in `polaris_saved_layouts` (record renderer, metrics, data sources, aliases, refresh recipe and last known snapshot), and reuse thereafter. Save meaningful layout changes as new versions.

## Important data integrity

- Each chart measures different activity and scales independently: TapBin admin audit events, LiveBridge broadcast sessions, Songwriters Compass usage events and Great Church zone page views.
- The saved layout is permanent, but data refresh is **on demand** through connected tools. The server does not automatically access ChatGPT or autonomously query all external accounts.
- Do not edit underlying production application records to test the dashboard.
- Do not expose secrets, private customer details, or personal user data on public dashboards.
- Keep original Polaris dashboard at `/` intact.

## Quick layout listing

```sql
SELECT layout_key,view,display_title,description,definition_json,refresh_recipe_json
FROM polaris_saved_layouts WHERE active=1 ORDER BY layout_key;
```

If the user says "show the same layout as before", first look up this registry and select the relevant layout instead of generating new HTML.
