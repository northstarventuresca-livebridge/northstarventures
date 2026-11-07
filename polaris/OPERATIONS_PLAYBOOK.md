# Polaris Operations — durable ChatGPT-first command centre

## Standing architecture

- **ChatGPT = the conversational interaction, memory/past-project context and authorized connected tools.**
- **Polaris = secure display hub and permanent project state**, hosted at https://polaris.northstarventures.ca.
- Existing futurist Live Display at https://polaris.northstarventures.ca/display is preserved.
- New Operations display: https://polaris.northstarventures.ca/command.
- ChatGPT and the Polaris website are **not automatically connected conversation streams**: ChatGPT must call the Cloudflare connector to update the D1 display state, while the browser reads/polls it.
- User preference: layouts are saved as permanent presets in `polaris_saved_layouts`; do **not** rebuild when refreshing their data.

## Persistent data and source

Northstar Cloudflare account `de139270326790931c82df02d785528f`.
Worker `polaris-mobile`, currently source v2.7.1 in
`northstarventuresca-livebridge/northstarventures/polaris/worker.js`.

- Source module: `polaris/command-centre-worker-v27.js`
- Source dashboard: `polaris/command-centre.html`
- Browser diagnostics source: `polaris/browser-diagnostics-v27.js`
- Existing live display: `polaris/display.html`
- Database schema migration: `polaris/OPERATIONS_SCHEMA.sql`
- Private D1 `polaris-conversation-log` database ID `c07cf5e5-1d25-4058-9814-9eb11030f0da`
- D1 tables `polaris_project_intelligence`, `polaris_work_queue`, `polaris_health_samples`, `polaris_error_events`, `polaris_briefings`, `polaris_monitor_runs`
- Database rows persist independently of a ChatGPT conversation. Code, configuration and reconstruction instructions are in GitHub; GitHub is **not** a live backup of every D1 row.

## Reading durable memory — start of every Polaris request

When the user says "pick up where we left off", "open project", "resume", "show status" or equivalent, first query Polaris D1 through the **Northstar Cloudflare connector**.

```sql
SELECT project_key,project_name,site_url,context_summary,verified_summary,
       verified_at,next_step,source_ref,status
FROM polaris_project_intelligence ORDER BY project_name;
```

```sql
SELECT id,project_key,title,details,priority,status,updated_at
FROM polaris_work_queue WHERE status!='done'
ORDER BY priority,updated_at DESC;
```

Then verify live source facts with appropriate authorized GitHub/Cloudflare connector before claiming new completion. Make the history vs live verification distinction explicit.

Changes to project records, queue or display state can be written via authorized Cloudflare connection when the user asks. Do not auto-mark tasks done merely because code was committed; require validation.

## Monitoring

Scheduled cron on `polaris-mobile`: `*/30 * * * *` (every 30 minutes, UTC).
- Public HTTP reachability checks: `https://tapbin.ca`, `https://livebridge.ca`, `https://compass.northstarventures.ca`, `https://greatchurch.ca`.
- Bound D1 source reads:
  - `TAPBIN_METRICS_DB`: Northstar Organizer production (`8d38ebec-fa74-48fb-95c9-b0cbb7984948`).
  - `LIVEBRIDGE_METRICS_DB`: LiveBridge production (`3d757c96-ec18-4144-be5e-95cbf43a9b1f`).
  - `COMPASS_METRICS_DB`: Songwriters Compass production (`2e7cb791-af6b-45c7-8525-7ae541c4975c`).
- Great Church is under a **separate church Cloudflare account**: website HTTP reachability can be scheduled; its request/page-view analytics still require read-only on-demand use of the church Cloudflare connector or separately authorized read-only credentials.
- Polling in the Operations page is every 30 seconds; this reads saved monitor results, not live source sites.
- Retention: health samples 35 days, monitor run metadata 14 days.
- Initial baseline manually established from confirmed Browser Rendering HTML checks of all four domains, labeled `browser-rendering-bootstrap` (no HTTP status captured). First scheduled run is pending verification.

## Morning briefing

The same Worker generates a briefing once at **7 AM America/Edmonton** daily, in table `polaris_briefings`, using its latest health checks, tasks and errors. Cron runs every half hour and selects local hour = 7; INSERT OR IGNORE by local date prevents duplicate briefings. Briefing is a structured read-only snapshot and does not send email.

**ChatGPT daily automation** `NorthStar Morning Briefing`, created and enabled, ID `6aeeabd7879c8191a55a87f1c5b09912`; scheduled daily at 7 AM America/Edmonton, beginning November 7, 2026. It requests a concise summary from connected Polaris D1 and provides a command-centre link. Check that its future runs have access to the connector and correct data; do not assume success before first execution.

## Work queue and diagnostics

Authenticated API routes:
- GET `/api/command-centre`: project intelligence, tasks, health, errors and latest briefing (requires Polaris session).
- POST `/api/task-create`: creates tracking task ONLY (never edits project code).
- POST `/api/task-status`: changes tracking task status ONLY.
- POST `/api/diagnostic`: stores a sanitized Polaris client error ONLY. Same-origin required and limited payload.
- All endpoints require Polaris access-cookie authorization; original Polaris login route remains intact.
- Browser error/unhandled promise reporting now installed in Polaris legacy dashboard, Live Display and Operations display.
- Worker catches unexpected errors and stores generic event names, without leaking secrets or stack traces.
- Remote app runtime exceptions (TapBin, HOH, X32, LiveBridge, Compass) are **not yet captured directly**. Future read-only telemetry from their Cloudflare logs or scoped instrumentation requires another separately verified integration.
- Error logging groups repeat events by a SHA-256 fingerprint and does not record passwords, raw browser input or private request bodies.

## Safety and boundaries

- Scheduled monitoring uses SELECTs against other applications' production D1 databases, and never changes their business records.
- No automatic code deployment, source modification, cleanup, payment changes, external messages, or account admin changes without explicit user instruction and validation.
- Tasks represent work to do, **not** jobs automatically executing in the background. ChatGPT can help complete tasks with connected apps during an active conversation or explicitly configured automation.
- PostHog was only optionally suggested; no PostHog installation, data integration, instrumentation, or subscription was performed.
- Existing Polaris Worker secrets and bindings are preserved; no full second AI required.

## Example use

"Polaris, pick up where we left off." → Fetch persistent project/task state; prioritize unfinished work; optionally show it on the existing Polaris Project Status layout.

"Show my morning briefing." → Fetch latest polaris_briefings, health and tasks; update the saved visual display state or link to /command.

"Fix the LiveBridge login issue." → Create/continue a tracked task, inspect GitHub and CF read-only, create backup/branch for authorized work, test changes and verify before declaring done.

"Update my project activity wall." → Reuse saved `four-project-activity` layout, refresh its datasets through connected source queries, and update only `polaris_display_state`.

_Last updated November 6, 2026, America/Edmonton._
