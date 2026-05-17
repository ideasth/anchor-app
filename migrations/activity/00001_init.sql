-- migrations/activity/00001_init.sql
-- Activity Log module — initial schema for activity.db
-- All tables are owned by this module; no SQL foreign keys to data.db.

CREATE TABLE IF NOT EXISTS activity_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,                                 -- nullable; multi-user-ready
  name        TEXT NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_subcategories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  category_id INTEGER NOT NULL REFERENCES activity_categories(id) ON DELETE RESTRICT,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(category_id, name)
);

CREATE TABLE IF NOT EXISTS activity_sources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  kind        TEXT NOT NULL,         -- perplexity_thread | perplexity_task | manual | timer | import | email_priority | buoy_task
  external_id TEXT,                  -- thread short_id, task id, etc.; nullable for manual/timer
  url         TEXT,                  -- e.g. pplx/sessions/<uuid> or https://www.perplexity.ai/search/<id>
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(kind, external_id)          -- one source row per external Perplexity object; manual/timer rows are not deduped
);

CREATE TABLE IF NOT EXISTS activity_entries (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER,
  entry_date           TEXT NOT NULL,    -- YYYY-MM-DD in Australia/Melbourne
  start_utc            TEXT,             -- ISO-8601 UTC; nullable for duration-only entries
  end_utc              TEXT,             -- ISO-8601 UTC; nullable while timer running or for duration-only
  duration_minutes     INTEGER,          -- computed from start/end if both present, else explicit
  title                TEXT NOT NULL,    -- short label, ≤200 chars
  context_summary      TEXT,             -- 1–3 sentences, ≤2000 chars
  notes                TEXT,             -- long-form free text, ≤20000 chars
  tags_json            TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings, ≤20 tags, each ≤40 chars
  category_id          INTEGER NOT NULL REFERENCES activity_categories(id) ON DELETE RESTRICT,
  subcategory_id       INTEGER REFERENCES activity_subcategories(id) ON DELETE RESTRICT,
  source_id            INTEGER REFERENCES activity_sources(id) ON DELETE SET NULL,
  source_link          TEXT,             -- denormalised for quick render; ≤1000 chars
  -- Cross-DB Buoy references — string/integer IDs only, no SQL FK to data.db
  buoy_task_id         TEXT,             -- references data.db tasks; nullable
  buoy_relationship_id TEXT,             -- references data.db relationships; nullable
  buoy_email_status_id TEXT,             -- references data.db email-status hits; nullable
  status               TEXT NOT NULL DEFAULT 'Open',  -- Open | Active | Complete | Parked
  billable             INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_entries_date         ON activity_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_activity_entries_category     ON activity_entries(category_id, subcategory_id);
CREATE INDEX IF NOT EXISTS idx_activity_entries_status       ON activity_entries(status);
CREATE INDEX IF NOT EXISTS idx_activity_entries_source       ON activity_entries(source_id);
CREATE INDEX IF NOT EXISTS idx_activity_entries_relationship ON activity_entries(buoy_relationship_id);
CREATE INDEX IF NOT EXISTS idx_activity_entries_task         ON activity_entries(buoy_task_id);

CREATE TABLE IF NOT EXISTS activity_timers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  entry_id    INTEGER NOT NULL UNIQUE REFERENCES activity_entries(id) ON DELETE CASCADE,
  started_utc TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  -- A row exists in this table iff a timer is currently running for that entry.
  -- Stop: delete row + set entry.end_utc / duration_minutes.
);

-- Full-text search across entries.
-- json_each_text_or_empty(x) helper: provided as a registered function at boot,
-- or implemented as a generated column. Here we use a placeholder that the
-- db.ts boot code replaces with a real SQLite scalar function.
CREATE VIRTUAL TABLE IF NOT EXISTS activity_entries_fts USING fts5(
  title,
  context_summary,
  notes,
  tags_text,
  content=activity_entries,
  content_rowid=id,
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS activity_entries_ai
AFTER INSERT ON activity_entries BEGIN
  INSERT INTO activity_entries_fts(rowid, title, context_summary, notes, tags_text)
  VALUES (
    new.id,
    new.title,
    COALESCE(new.context_summary, ''),
    COALESCE(new.notes, ''),
    COALESCE((SELECT group_concat(value, ' ') FROM json_each(new.tags_json)), '')
  );
END;

CREATE TRIGGER IF NOT EXISTS activity_entries_ad
AFTER DELETE ON activity_entries BEGIN
  INSERT INTO activity_entries_fts(activity_entries_fts, rowid, title, context_summary, notes, tags_text)
  VALUES (
    'delete',
    old.id,
    old.title,
    COALESCE(old.context_summary, ''),
    COALESCE(old.notes, ''),
    COALESCE((SELECT group_concat(value, ' ') FROM json_each(old.tags_json)), '')
  );
END;

CREATE TRIGGER IF NOT EXISTS activity_entries_au
AFTER UPDATE ON activity_entries BEGIN
  INSERT INTO activity_entries_fts(activity_entries_fts, rowid, title, context_summary, notes, tags_text)
  VALUES (
    'delete',
    old.id,
    old.title,
    COALESCE(old.context_summary, ''),
    COALESCE(old.notes, ''),
    COALESCE((SELECT group_concat(value, ' ') FROM json_each(old.tags_json)), '')
  );
  INSERT INTO activity_entries_fts(rowid, title, context_summary, notes, tags_text)
  VALUES (
    new.id,
    new.title,
    COALESCE(new.context_summary, ''),
    COALESCE(new.notes, ''),
    COALESCE((SELECT group_concat(value, ' ') FROM json_each(new.tags_json)), '')
  );
END;
