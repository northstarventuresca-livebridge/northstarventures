# North Star project-isolated diagnostics (first milestone)

Each project has its own allowlisted hosts, test selection, test history directory, and downloadable CI artifact. The `change` level runs targeted plus regression checks; `full` includes additional checks. Failed checks fail the GitHub Actions job.

## Running

`node --test tests/diagnostics.test.mjs`

`node diagnostics/runner.mjs --project home-of-hope --level change`

GitHub Actions > **North Star isolated diagnostics** > **Run workflow** offers a project and level selection.

## Safety and current limits

- Current checks are **read-only HTTP responses only**. An HTTP 200 does **not** prove that a page rendered correctly, that the user can log in, or that buttons function.
- No production forms, passwords, cookies, database writes, or live mixer controls are exercised.
- Tests are **not** yet automatically triggered after deployments to separate product repositories. This initial workflow runs unit tests on this PR and read-only smoke checks on explicit workflow dispatch.
- The X32 project intentionally reports `not-run` until its separate bridge/hardware test adapter is safely connected.
- Reports are stored only in GitHub Actions artifacts, segregated under each project's directory. No live Command Center UI, cross-project report API, browser-based Playwright tests, or error telemetry collector exists yet.
- Future adapters must mask secrets and user data, run in protected environments, and preserve per-project isolation. Prefer staged test accounts for login/button workflows.
