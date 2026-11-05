# North Star isolated diagnostics — browser testing foundation

Project-specific tests have separate definitions, run IDs and report artifact paths. Each update can run **targeted + fast regression** checks; **full** adds broader tests.

## Test types

- `http-get`: safe read-only HTTP status check.
- `browser-page`: launches real Chromium, opens page, verifies a visible selector, records JavaScript/console errors and HTTP 5xx responses.
- `browser-click`: opt-in for **dedicated test environments only**, limited to selectors starting with `[data-diagnostic-safe=` and blocked unless `safeInteraction: true`; HTTP mutation requests are blocked. Do **not** use on production websites.

Browser runs refuse non-GET/HEAD requests and reject cross-origin page navigations outside the project allowlist; they can fetch HTTPS assets. Recorded errors redact URL queries and common credential patterns. No authenticated admin tests are enabled yet.

## Running

`node --test tests/diagnostics.test.mjs tests/browser-diagnostics.test.mjs`

`node diagnostics/runner.mjs --project home-of-hope --level change`

For Chromium checks:

`npm install --no-save --ignore-scripts playwright@1.56.1`

`npx --no-install playwright install chromium`

`node diagnostics/browser-runner.mjs --project northstar-command-center --level change`

GitHub Actions **North Star isolated diagnostics** runs the local unit tests on pull requests. It also runs a real Chromium smoke test for North Star Command Center, saving a per-project browser report. Manual workflow dispatch can select Home of Hope, LiveBridge, or another listed project.

## Current limits

- This is a **development branch**, not deployed as a Command Center UI.
- Browser checks currently test **public page rendering, not authenticated login or app functionality**. Button-click tests require a separate safe staging environment and explicit safe controls; none are enabled in the live projects.
- Production tests do not submit forms, set passwords, change database records, or control the X32.
- Cross-repository auto-triggering after deployments, private error telemetry, real authenticated test accounts, and actual failed-action reproduction are still to be implemented.
- X32 intentionally reports **not-run** until an approved bridge/hardware adapter is attached.
- Reports remain in private GitHub Actions artifacts for **14 days**, not in a shared public log or a live Command Center dashboard.
- If page JavaScript errors or browser-blocked requests occur, the check can fail; those failures should be investigated rather than silently suppressed.
