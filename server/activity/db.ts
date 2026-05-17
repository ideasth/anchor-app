// server/activity/db.ts
// ATTACH activity.db to the Buoy Node process, run migrations/activity/*.sql
// in order at boot. Fail-fast on migration error (throws, halts startup).

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// The activity.db path sits alongside data.db in the CWD.
// Tests may override via ACTIVITY_TEST_DB env var.
export function resolveActivityDbPath(): string {
  return process.env.ACTIVITY_TEST_DB ?? path.resolve(process.cwd(), "activity.db");
}

let _activityDb: Database.Database | null = null;

/** Return the shared activity.db connection. Initialises on first call. */
export function getActivityDb(): Database.Database {
  if (_activityDb) return _activityDb;
  const dbPath = resolveActivityDbPath();
  _activityDb = new Database(dbPath);
  // WAL mode for concurrency with the main process.
  _activityDb.pragma("journal_mode = WAL");
  _activityDb.pragma("foreign_keys = ON");
  runMigrations(_activityDb);
  return _activityDb;
}

/** Allow tests to inject a fresh in-memory database. */
export function _setActivityTestDb(db: Database.Database): void {
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  _activityDb = db;
}

/** Reset for test isolation. */
export function _resetActivityDb(): void {
  _activityDb = null;
}

function runMigrations(db: Database.Database): void {
  const migrationsDir = path.resolve(__dirname, "../../migrations/activity");

  // If the migrations directory does not exist (e.g. test environment where
  // __dirname resolves to the source tree root), skip file-based migrations.
  // The in-memory tests seed the schema directly.
  if (!fs.existsSync(migrationsDir)) {
    runInlineMigrations(db);
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    runInlineMigrations(db);
    return;
  }

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    try {
      db.exec(sql);
    } catch (err) {
      throw new Error(
        `[activity/db] Migration failed: ${file}\n${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Inline schema used when the migrations/activity directory is absent
 * (unit-test environments that call _setActivityTestDb with new Database(':memory:')).
 */
export function runInlineMigrations(db: Database.Database): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS activity_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
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
  kind        TEXT NOT NULL,
  external_id TEXT,
  url         TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(kind, external_id)
);

CREATE TABLE IF NOT EXISTS activity_entries (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER,
  entry_date           TEXT NOT NULL,
  start_utc            TEXT,
  end_utc              TEXT,
  duration_minutes     INTEGER,
  title                TEXT NOT NULL,
  context_summary      TEXT,
  notes                TEXT,
  tags_json            TEXT NOT NULL DEFAULT '[]',
  category_id          INTEGER NOT NULL REFERENCES activity_categories(id) ON DELETE RESTRICT,
  subcategory_id       INTEGER REFERENCES activity_subcategories(id) ON DELETE RESTRICT,
  source_id            INTEGER REFERENCES activity_sources(id) ON DELETE SET NULL,
  source_link          TEXT,
  buoy_task_id         TEXT,
  buoy_relationship_id TEXT,
  buoy_email_status_id TEXT,
  status               TEXT NOT NULL DEFAULT 'Open',
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
);

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

CREATE TABLE IF NOT EXISTS activity_digests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER,
  iso_week        TEXT NOT NULL,
  generated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  narrative       TEXT NOT NULL,
  aggregates_json TEXT NOT NULL,
  markdown        TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'cron'
);

CREATE INDEX IF NOT EXISTS idx_activity_digests_week ON activity_digests(iso_week);
  `);

  // Seed canonical taxonomy (idempotent).
  seedTaxonomy(db);
}

function seedTaxonomy(db: Database.Database): void {
  const catInsert = db.prepare(
    `INSERT INTO activity_categories (id, name, sort_order) VALUES (?, ?, ?) ON CONFLICT(name) DO NOTHING`,
  );
  const cats: [number, string, number][] = [
    [1, "Work", 1],
    [2, "Home", 2],
    [3, "Personal", 3],
    [4, "General query", 4],
    [5, "Product search", 5],
  ];
  for (const [id, name, sort_order] of cats) {
    catInsert.run(id, name, sort_order);
  }

  const subInsert = db.prepare(
    `INSERT INTO activity_subcategories (category_id, name, sort_order) VALUES (?, ?, ?) ON CONFLICT(category_id, name) DO NOTHING`,
  );
  const subs: [number, string, number][] = [
    [1, "Governance", 1],
    [1, "Complaints", 2],
    [1, "Service planning", 3],
    [1, "Medico-legal", 4],
    [1, "VPS infrastructure", 5],
    [1, "M365 automation", 6],
    [1, "App development", 7],
    [3, "Family", 1],
    [5, "Shopping", 1],
    [2, "Home maintenance", 1],
    [1, "Photography studio", 8],
    [3, "Gaming Axel", 2],
    [1, "Other", 99],
  ];
  for (const [cat_id, name, sort_order] of subs) {
    subInsert.run(cat_id, name, sort_order);
  }
}
