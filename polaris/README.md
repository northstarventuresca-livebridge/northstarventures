# POLARIS — North Star Ventures mobile AI command center

## v2.4.2 — relational routing and optional ChatGPT history import (November 6, 2026)

- A single conversational OpenAI assistant routes questions behind the scenes to one of five purposes: chat, project history, project website directory, GitHub/Cloudflare source, or read-only live application metrics. It continues streaming text and optional early-start voice.
- New fixed-tool read-only production lookup for **LiveBridge organization counts** through an additional D1 binding `LIVEBRIDGE_METRICS_DB` pointing to the production `livebridge-db`. It executes a fixed aggregate SELECT and does not return IDs, email addresses or account records. This binding technically supports D1 access in the Worker; the implementation deliberately exposes only the count query.
- Project history `project_memory` stores dated, sourced recollections of previous work. Some are historical summaries, *not* verified live facts. Explicitly avoid inventing exact lists, recent deployments or completion dates when the original chat has not been imported.
- Prior Polaris dialogue is now tagged by project (`dialogue_turns.project`) to keep follow-up context from jumping between unrelated topics. Unnamed follow-ups use the last recognized project or the selected project.
- ChatGPT's personal conversation history and ChatGPT-connected GitHub/Cloudflare plugins do **not** automatically transfer to the OpenAI API. A new **IMPORT CHATGPT HISTORY** control accepts an explicitly chosen `conversations.json` from the user's official ChatGPT data export. The user may import project chats only or opt into all chats. Text is stored in `imported_chat_messages`, searchable via `imported_chat_fts`, with a delete control. This is a snapshot; future ChatGPT work is not live-synced.
- The importer and search are in `polaris/chatgpt-import-v24.js` and `polaris/chatgpt-import-ui-v24.js`; the router is in `polaris/relational-router-v24.js`. Each is embedded into `polaris/worker.js` when deploying.
- Production source credentials are still scoped and separate: `POLARIS_GITHUB_NSV_READ_TOKEN` is connected; church Cloudflare/GitHub tokens and most live application data connectors remain unconfigured. Do not claim universal project access.
- FTS5 index and project tables were created in Polaris D1. `dialogue_turns.project` was added once as a migration; do not repeat that ALTER on an existing database. Avoid public endpoints with import data. All import endpoints require the existing Polaris cookie authentication.



## v2.2 — faster Read Reply and read-only project sources (November 6, 2026)

- Returned the **READ-ALOUD SPEED** slider, which controls the existing pitch-preserving audio renderer (0.85×–1.65×) without intentionally raising voice pitch.
- Read Reply now breaks the first passage at a shorter sentence boundary and prefetches audio for the next passage in parallel. It may still take a few seconds to synthesize the first passage; do not claim live-phone latency without a real device test.
- Added project context picker and natural-language switching. Polaris sources are organized by verified project, with an indexed **snapshot of 25 distinct GitHub repos, 47 NorthStar Cloudflare Worker names, and 7 README documents (11 excerpt sections)**. Snapshot records must never be presented as live status or complete code coverage.
- Project registry stored in private D1 `POLARIS_DB` tables `project_registry` and `project_documents`. OpenAI receives only relevant project context for project-related queries, with short excerpts for normal questions.
- Built an **optional read-only on-demand source reader**, with no write, deploy, update or delete endpoints. Tokens are absent as of this release, and private code access remains disconnected.
- To enable live source reading later, add one or more scoped secrets to the `polaris-mobile` Worker:
  - `POLARIS_GITHUB_NSV_READ_TOKEN`: fine-grained GitHub token with repository Contents **Read-only** permission for needed repositories under `northstarventuresca-livebridge`.
  - `POLARIS_GITHUB_CHURCH_READ_TOKEN`: similarly scoped token for `globalconnectionschurch-eng`.
  - `POLARIS_GITHUB_PERSONAL_READ_TOKEN`: similarly scoped token for `rwyers`.
  - `POLARIS_CF_NSV_READ_TOKEN`: Cloudflare API token for the NorthStar account with **Workers Scripts Read** only.
- The live reader restricts GitHub reads to verified repository identities, excludes suspicious file paths, redacts obvious credentials, truncates sources and caps requested files. Cloudflare Worker source is accessed only by exact verified script name. Even with tokens, this is selective on-demand reading, **not a full indexed copy of every file, ChatGPT history, deployment status or operational database**. Never infer production resource dependencies from script names.
- Future Worker deployments must preserve *all* configured secret bindings, including read-only source tokens once added.
- Read-only access to church Cloudflare resources requires a separate authorized church-account token; the NorthStar API token cannot read a different account.



## v2.0 — OpenAI-connected text-first Polaris (November 6, 2026)

- The **live Worker** `polaris-mobile` uses `Polaris_open_ai` (Cloudflare secret) to call the OpenAI **Responses API** with model `gpt-6.1-sol`; it never exposes the API key to the phone or GitHub.
- User messages stream through authenticated `POST /api/ask-stream` as progressively rendered text. Legacy `POST /api/ask` also uses OpenAI with a regular JSON response. **Cloudflare Workers AI is no longer used for text chat**; it remains connected for optional Deepgram read-aloud speech.
- Responses are stored in private D1 `POLARIS_DB` with source, time, model, feedback and recent context. The current interface supports dictated text, manual review + Send, streaming conversation output, optional Read Aloud, and private conversation log.
- OpenAI key existence and deployed binding were verified, and the mobile UI was rendered successfully. **Full authenticated first-call billing/availability verification must be completed in the phone session**. If a request fails, the UI reports errors about API key access or OpenAI billing; it must not silently switch to a less capable model.
- **Important:** OpenAI's API does **not** inherit the user's ChatGPT account conversation history or Projects. Direct project history import and retrieval are not yet connected. Do not claim the user is speaking to this very same ChatGPT session.
- Source modules: `openai-engine-v20.js` and `openai-ui-v20.js` are embedded into `polaris/worker.js` for deployment, in addition to the older frontend patches. A standalone change to those modules must be re-embedded in the Worker and deployed.
- Costs are charged by OpenAI API tokens, separate from ChatGPT Plus; verify the OpenAI project billing and spending limits.



**Live:** https://polaris.northstarventures.ca  
**Worker:** `polaris-mobile` (Northstar Cloudflare account)  
**Source:** `polaris/index.html`, `polaris/worker.js`, `polaris/voice-upgrade-v17.js`, `polaris/dialogue-upgrade-v18.js`.

## v1.8 capabilities

- Mobile-first sci-fi dashboard with six locally tracked project cards and website shortcuts.
- Browser speech recognition with **1.15 second final-utterance coalescing** before a request. Designed to combine partial final transcripts rather than generate multiple AI replies for fragments.
- Conversational AI: DeepSeek V4 Flash for everyday exchanges and V4 Pro for brainstorming, design, planning and complex questions; gpt-oss-120b fallback. **Model text is hosted by Cloudflare Workers AI, not the user's ChatGPT account.**
- Persistent last **22 AI exchanges** as recent conversation context.
- Private, login-protected **D1** transcript and response journal with model, latency, source and reviewer feedback. UI has CONVERSATION LOG, mark WRONG/HELPFUL, export JSON and delete.
- Spoken reply chunking under 610 characters per synthesis call to preserve complete long replies; pitch-preserving accelerated playback via existing WSOLA-like processor.
- Echo guard; experimental simultaneous interruption optional, **off by default** because it can interfere with Android Web Speech recognition.

## Database

D1 database name: `polaris-conversation-log`  
D1 binding: `POLARIS_DB`  
D1 database ID: `c07cf5e5-1d25-4058-9814-9eb11030f0da`  
Schema: `polaris/migrations/0001_dialogue_turns.sql`

Text logs only; **microphone audio is not stored** in this database. Entries older than 30 days are deleted when conversation/history routes are next accessed (not yet via a scheduled job). Logs from prior versions are not backfilled. Treat saved transcripts as private content.

## Worker secrets and bindings

- `POLARIS_ACCESS_CODE` — existing private password (never put its value in Git)
- `POLARIS_AUTH_SECRET` — existing session signing secret (never put its value in Git)
- `AI` — Cloudflare Workers AI binding
- `POLARIS_DB` — D1 binding

## Maintenance

- **DeepSeek V4 Flash/Pro Cloudflare-hosted model IDs are marked for deprecation November 15, 2026.** Check replacement availability and update the router before that date. The gpt-oss-120b fallback remains configured.
- UI is assembled by the Worker: it fetches pinned `polaris/index.html` and inserts the v1.7 voice patch and v1.8 dialogue patch into the page. When modifying either patch, update the embedded Worker string and redeploy; editing the GitHub patch alone does not change the live app.
- For quality review, query D1 with `SELECT created_at,source,user_text,assistant_text,model,feedback,feedback_notes FROM dialogue_turns ORDER BY created_at DESC LIMIT 50;` (only under authorized account).
- Do not claim access to ChatGPT memory, live project APIs, or autonomous site changes until the integrations exist.
