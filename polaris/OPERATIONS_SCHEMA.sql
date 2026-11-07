-- Polaris Operations v2.7; non-destructive and idempotent.
-- D1: polaris-conversation-log. Preserve all pre-existing Polaris tables.
CREATE TABLE IF NOT EXISTS polaris_project_intelligence (
 project_key TEXT PRIMARY KEY, project_name TEXT NOT NULL, site_url TEXT,
 context_summary TEXT NOT NULL DEFAULT '', verified_summary TEXT NOT NULL DEFAULT '',
 verified_at TEXT, next_step TEXT NOT NULL DEFAULT '',
 source_ref TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'tracked',
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS polaris_work_queue (
 id TEXT PRIMARY KEY, project_key TEXT NOT NULL, title TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '', priority INTEGER NOT NULL DEFAULT 3
 CHECK(priority BETWEEN 1 AND 5),
 status TEXT NOT NULL DEFAULT 'backlog'
 CHECK(status IN ('backlog','ready','in_progress','blocked','verification','done')),
 requires_approval INTEGER NOT NULL DEFAULT 1, approved_at TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 source TEXT NOT NULL DEFAULT 'chatgpt'
);
CREATE INDEX IF NOT EXISTS idx_polaris_work_queue_status
 ON polaris_work_queue(status,priority,updated_at);
CREATE TABLE IF NOT EXISTS polaris_health_samples (
 id INTEGER PRIMARY KEY AUTOINCREMENT, project_key TEXT NOT NULL,
 sampled_at TEXT NOT NULL, state TEXT NOT NULL
 CHECK(state IN ('responding','degraded','unreachable','unknown')),
 http_status INTEGER, latency_ms INTEGER,
 source TEXT NOT NULL DEFAULT 'website', metric_json TEXT NOT NULL DEFAULT '{}',
 details TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_polaris_health_project_sample
 ON polaris_health_samples(project_key,sampled_at DESC);
CREATE TABLE IF NOT EXISTS polaris_error_events (
 id TEXT PRIMARY KEY, project_key TEXT NOT NULL,
 severity TEXT NOT NULL DEFAULT 'error',
 summary TEXT NOT NULL, fingerprint TEXT NOT NULL, source TEXT NOT NULL,
 occurrences INTEGER NOT NULL DEFAULT 1,
 first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
 resolved INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_polaris_error_open
 ON polaris_error_events(resolved,last_seen DESC);
CREATE TABLE IF NOT EXISTS polaris_briefings (
 local_date TEXT PRIMARY KEY, created_at TEXT NOT NULL,
 timezone TEXT NOT NULL DEFAULT 'America/Edmonton',
 briefing_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS polaris_monitor_runs (
 id TEXT PRIMARY KEY, started_at TEXT NOT NULL, completed_at TEXT,
 state TEXT NOT NULL DEFAULT 'running', notes TEXT NOT NULL DEFAULT ''
);
