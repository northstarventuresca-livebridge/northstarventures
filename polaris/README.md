# POLARIS — North Star Ventures mobile AI command center

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
