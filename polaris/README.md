# POLARIS — North Star Ventures mobile AI command center

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
