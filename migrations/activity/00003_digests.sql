-- migrations/activity/00003_digests.sql
-- Weekly activity digest table (populated by cron / on-demand digest endpoint).

CREATE TABLE IF NOT EXISTS activity_digests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER,
  iso_week        TEXT NOT NULL,              -- YYYY-Www
  generated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  narrative       TEXT NOT NULL,              -- LLM-written paragraph
  aggregates_json TEXT NOT NULL,              -- the SQL aggregates as JSON
  markdown        TEXT NOT NULL,              -- fully assembled body
  source          TEXT NOT NULL DEFAULT 'cron'  -- cron | manual
);

CREATE INDEX IF NOT EXISTS idx_activity_digests_week ON activity_digests(iso_week);
