// Stage 17 — storage layer for family tables and public_calendar_blocks.
//
// Tables are created with CREATE TABLE IF NOT EXISTS so they bootstrap on
// first boot without a separate migration runner (consistent with how
// storage.ts handles new tables).

import Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// DB handle — shared with app-settings.ts via the same data.db file.
// Tests can inject an in-memory instance.
// ---------------------------------------------------------------------------

function resolveDbPath(): string {
  return process.env.STAGE17_TEST_DB ?? "data.db";
}

let _db: Database.Database | null = null;

export function getFamilyDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(resolveDbPath());
  bootstrapTables(_db);
  return _db;
}

export function _setFamilyTestDb(db: Database.Database): void {
  bootstrapTables(db);
  _db = db;
}

export function _resetFamilyDbForTest(): void {
  _db = null;
}

function bootstrapTables(db: Database.Database): void {
  db.exec(`
-- Public calendar manual overrides
CREATE TABLE IF NOT EXISTS public_calendar_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  kind TEXT NOT NULL,
  start_utc TEXT,
  end_utc TEXT,
  weekday INTEGER,
  source_event_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_public_calendar_blocks_kind ON public_calendar_blocks(kind);
CREATE INDEX IF NOT EXISTS idx_public_calendar_blocks_window ON public_calendar_blocks(start_utc, end_utc);

-- Family-added events (never written to Outlook)
CREATE TABLE IF NOT EXISTS family_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT NOT NULL,
  start_utc TEXT NOT NULL,
  end_utc TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  notes TEXT,
  added_by TEXT,
  count_as_busy_for_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_family_events_window ON family_events(start_utc, end_utc);

-- Day notes (one per Australia/Melbourne calendar date)
CREATE TABLE IF NOT EXISTS family_day_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  date_local TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Week notes (one per ISO week, anchored in Australia/Melbourne)
CREATE TABLE IF NOT EXISTS family_week_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  iso_week TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FamilyEvent {
  id: number;
  user_id: number | null;
  title: string;
  start_utc: string;
  end_utc: string;
  all_day: number;
  location: string | null;
  notes: string | null;
  added_by: string | null;
  count_as_busy_for_public: number;
  created_at: string;
  updated_at: string;
}

export interface FamilyDayNote {
  id: number;
  user_id: number | null;
  date_local: string;
  body: string;
  updated_by: string | null;
  updated_at: string;
}

export interface FamilyWeekNote {
  id: number;
  user_id: number | null;
  iso_week: string;
  body: string;
  updated_by: string | null;
  updated_at: string;
}

export interface PublicCalendarBlock {
  id: number;
  user_id: number | null;
  kind: "force_available" | "force_busy" | "rule_off_day";
  start_utc: string | null;
  end_utc: string | null;
  weekday: number | null;
  source_event_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Family events CRUD
// ---------------------------------------------------------------------------

export function listFamilyEvents(fromUtc: string, toUtc: string): FamilyEvent[] {
  const db = getFamilyDb();
  return db
    .prepare(
      `SELECT * FROM family_events WHERE start_utc < ? AND end_utc > ? ORDER BY start_utc`,
    )
    .all(toUtc, fromUtc) as FamilyEvent[];
}

export function getFamilyEvent(id: number): FamilyEvent | null {
  const db = getFamilyDb();
  return (
    (db.prepare(`SELECT * FROM family_events WHERE id = ?`).get(id) as FamilyEvent | undefined) ??
    null
  );
}

export interface CreateFamilyEventArgs {
  title: string;
  start_utc: string;
  end_utc: string;
  all_day?: number;
  location?: string | null;
  notes?: string | null;
  added_by?: string | null;
  count_as_busy_for_public?: number;
  user_id?: number | null;
}

export function createFamilyEvent(args: CreateFamilyEventArgs): FamilyEvent {
  validateFamilyEvent(args);
  const db = getFamilyDb();
  const result = db
    .prepare(
      `INSERT INTO family_events (title, start_utc, end_utc, all_day, location, notes, added_by, count_as_busy_for_public, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      args.title,
      args.start_utc,
      args.end_utc,
      args.all_day ?? 0,
      args.location ?? null,
      args.notes ?? null,
      args.added_by ?? null,
      args.count_as_busy_for_public ?? 1,
      args.user_id ?? null,
    );
  return getFamilyEvent(result.lastInsertRowid as number)!;
}

export interface PatchFamilyEventArgs {
  title?: string;
  start_utc?: string;
  end_utc?: string;
  all_day?: number;
  location?: string | null;
  notes?: string | null;
  count_as_busy_for_public?: number;
  updated_by?: string | null;
}

export function patchFamilyEvent(id: number, patch: PatchFamilyEventArgs): FamilyEvent | null {
  const existing = getFamilyEvent(id);
  if (!existing) return null;
  const merged = {
    title: patch.title ?? existing.title,
    start_utc: patch.start_utc ?? existing.start_utc,
    end_utc: patch.end_utc ?? existing.end_utc,
    all_day: patch.all_day ?? existing.all_day,
    location: "location" in patch ? patch.location : existing.location,
    notes: "notes" in patch ? patch.notes : existing.notes,
    count_as_busy_for_public: patch.count_as_busy_for_public ?? existing.count_as_busy_for_public,
  };
  validateFamilyEvent(merged);
  const db = getFamilyDb();
  db.prepare(
    `UPDATE family_events SET title=?, start_utc=?, end_utc=?, all_day=?, location=?, notes=?, count_as_busy_for_public=?, updated_at=datetime('now') WHERE id=?`,
  ).run(
    merged.title,
    merged.start_utc,
    merged.end_utc,
    merged.all_day,
    merged.location ?? null,
    merged.notes ?? null,
    merged.count_as_busy_for_public,
    id,
  );
  return getFamilyEvent(id);
}

export function deleteFamilyEvent(id: number): boolean {
  const db = getFamilyDb();
  const result = db.prepare(`DELETE FROM family_events WHERE id = ?`).run(id);
  return result.changes > 0;
}

function validateFamilyEvent(args: { title: string; start_utc: string; end_utc: string; notes?: string | null }) {
  if (!args.title || args.title.trim().length === 0) throw new Error("title required");
  if (args.title.length > 200) throw new Error("title max 200 chars");
  if (!args.start_utc || !args.end_utc) throw new Error("start_utc and end_utc required");
  if (args.start_utc >= args.end_utc) throw new Error("start_utc must be before end_utc");
  const durationMs = new Date(args.end_utc).getTime() - new Date(args.start_utc).getTime();
  if (durationMs > 30 * 24 * 60 * 60 * 1000) throw new Error("event window max 30 days");
  if (args.notes && args.notes.length > 2000) throw new Error("notes max 2000 chars");
}

// ---------------------------------------------------------------------------
// Family day notes CRUD
// ---------------------------------------------------------------------------

export function getFamilyDayNote(dateLocal: string): FamilyDayNote | null {
  const db = getFamilyDb();
  return (
    (db
      .prepare(`SELECT * FROM family_day_notes WHERE date_local = ?`)
      .get(dateLocal) as FamilyDayNote | undefined) ?? null
  );
}

export function upsertFamilyDayNote(
  dateLocal: string,
  body: string,
  updatedBy: string | null = null,
): FamilyDayNote | null {
  if (body.length > 2000) throw new Error("body max 2000 chars");
  const db = getFamilyDb();
  if (!body.trim()) {
    db.prepare(`DELETE FROM family_day_notes WHERE date_local = ?`).run(dateLocal);
    return null;
  }
  db.prepare(
    `INSERT INTO family_day_notes (date_local, body, updated_by, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(date_local) DO UPDATE SET body=excluded.body, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
  ).run(dateLocal, body, updatedBy);
  return getFamilyDayNote(dateLocal);
}

// ---------------------------------------------------------------------------
// Family week notes CRUD
// ---------------------------------------------------------------------------

export function getFamilyWeekNote(isoWeek: string): FamilyWeekNote | null {
  const db = getFamilyDb();
  return (
    (db
      .prepare(`SELECT * FROM family_week_notes WHERE iso_week = ?`)
      .get(isoWeek) as FamilyWeekNote | undefined) ?? null
  );
}

export function upsertFamilyWeekNote(
  isoWeek: string,
  body: string,
  updatedBy: string | null = null,
): FamilyWeekNote | null {
  if (body.length > 2000) throw new Error("body max 2000 chars");
  const db = getFamilyDb();
  if (!body.trim()) {
    db.prepare(`DELETE FROM family_week_notes WHERE iso_week = ?`).run(isoWeek);
    return null;
  }
  db.prepare(
    `INSERT INTO family_week_notes (iso_week, body, updated_by, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(iso_week) DO UPDATE SET body=excluded.body, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
  ).run(isoWeek, body, updatedBy);
  return getFamilyWeekNote(isoWeek);
}

// ---------------------------------------------------------------------------
// Public calendar blocks CRUD
// ---------------------------------------------------------------------------

export function listPublicCalendarBlocks(): PublicCalendarBlock[] {
  const db = getFamilyDb();
  return db
    .prepare(`SELECT * FROM public_calendar_blocks ORDER BY created_at`)
    .all() as PublicCalendarBlock[];
}

export function getPublicCalendarBlock(id: number): PublicCalendarBlock | null {
  const db = getFamilyDb();
  return (
    (db
      .prepare(`SELECT * FROM public_calendar_blocks WHERE id = ?`)
      .get(id) as PublicCalendarBlock | undefined) ?? null
  );
}

export interface CreateBlockArgs {
  kind: "force_available" | "force_busy" | "rule_off_day";
  start_utc?: string | null;
  end_utc?: string | null;
  weekday?: number | null;
  source_event_id?: string | null;
  note?: string | null;
  user_id?: number | null;
}

export function createPublicCalendarBlock(args: CreateBlockArgs): PublicCalendarBlock {
  const db = getFamilyDb();
  const result = db
    .prepare(
      `INSERT INTO public_calendar_blocks (kind, start_utc, end_utc, weekday, source_event_id, note, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      args.kind,
      args.start_utc ?? null,
      args.end_utc ?? null,
      args.weekday ?? null,
      args.source_event_id ?? null,
      args.note ?? null,
      args.user_id ?? null,
    );
  return getPublicCalendarBlock(result.lastInsertRowid as number)!;
}

export function deletePublicCalendarBlock(id: number): boolean {
  const db = getFamilyDb();
  const result = db.prepare(`DELETE FROM public_calendar_blocks WHERE id = ?`).run(id);
  return result.changes > 0;
}
