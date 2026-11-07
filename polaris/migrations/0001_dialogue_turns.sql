-- Polaris private dialogue journal (Cloudflare D1).
-- Store transcribed submitted commands and AI replies, never raw microphone audio.
CREATE TABLE IF NOT EXISTS dialogue_turns (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL DEFAULT 'ai',
 source TEXT NOT NULL DEFAULT 'microphone',
 user_text TEXT NOT NULL,
 assistant_text TEXT NOT NULL,
 model TEXT NOT NULL DEFAULT '',
 latency_ms INTEGER NOT NULL DEFAULT 0,
 feedback TEXT NOT NULL DEFAULT '',
 feedback_notes TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS dialogue_turns_recent ON dialogue_turns(created_at DESC);
CREATE INDEX IF NOT EXISTS dialogue_turns_kind_time ON dialogue_turns(kind,created_at DESC);
