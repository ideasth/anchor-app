// Stage 20 (2026-05-17) — Activity DB: migration idempotency and FTS triggers.

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { _setActivityTestDb, _resetActivityDb, runInlineMigrations } from "../server/activity/db";
import { createEntry, deleteEntry, updateEntry } from "../server/activity/service";

function makeTestDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runInlineMigrations(db);
  return db;
}

describe("Stage 20 — activity DB migrations", () => {
  beforeEach(() => {
    _resetActivityDb();
  });

  it("creates all expected tables", () => {
    const db = makeTestDb();
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain("activity_categories");
    expect(tables).toContain("activity_subcategories");
    expect(tables).toContain("activity_sources");
    expect(tables).toContain("activity_entries");
    expect(tables).toContain("activity_timers");
    expect(tables).toContain("activity_digests");
  });

  it("creates the FTS5 virtual table", () => {
    const db = makeTestDb();
    const fts = db
      .prepare(`SELECT name FROM sqlite_master WHERE name='activity_entries_fts'`)
      .get() as { name: string } | undefined;
    expect(fts?.name).toBe("activity_entries_fts");
  });

  it("migrations are idempotent — running twice does not throw", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    expect(() => runInlineMigrations(db)).not.toThrow();
    expect(() => runInlineMigrations(db)).not.toThrow();
  });

  it("seeds 5 categories", () => {
    const db = makeTestDb();
    const cats = db.prepare("SELECT COUNT(*) as n FROM activity_categories").get() as { n: number };
    expect(cats.n).toBeGreaterThanOrEqual(5);
  });

  it("seeds 13 subcategories", () => {
    const db = makeTestDb();
    const subs = db.prepare("SELECT COUNT(*) as n FROM activity_subcategories").get() as { n: number };
    expect(subs.n).toBeGreaterThanOrEqual(13);
  });

  it("FTS insert trigger fires on activity_entries INSERT", () => {
    const db = makeTestDb();
    _setActivityTestDb(db);

    const entry = createEntry({
      entryDate: "2026-05-17",
      title: "FTS trigger test uniqueword",
      categoryId: 1,
      status: "Open",
    });

    // Verify by MATCH query (SELECT * doesn't work on content FTS5 tables).
    const ftsRows = db
      .prepare(`SELECT rowid FROM activity_entries_fts WHERE activity_entries_fts MATCH 'uniqueword'`)
      .all() as any[];
    expect(ftsRows.length).toBeGreaterThanOrEqual(1);
    expect(ftsRows.some((r) => r.rowid === entry.id)).toBe(true);
  });

  it("FTS delete trigger fires on activity_entries DELETE", () => {
    const db = makeTestDb();
    _setActivityTestDb(db);

    const entry = createEntry({
      entryDate: "2026-05-17",
      title: "Delete trigger test",
      categoryId: 1,
      status: "Open",
    });

    deleteEntry(entry.id);

    // After delete, FTS should not return a match for the entry id.
    const hits = db
      .prepare(`SELECT rowid FROM activity_entries_fts WHERE activity_entries_fts MATCH 'triggertest'`)
      .all() as any[];
    const hasOurEntry = hits.some((h) => h.rowid === entry.id);
    expect(hasOurEntry).toBe(false);
  });

  it("FTS update trigger fires on activity_entries UPDATE", () => {
    const db = makeTestDb();
    _setActivityTestDb(db);

    const entry = createEntry({
      entryDate: "2026-05-17",
      title: "Before update",
      categoryId: 1,
      status: "Open",
    });

    updateEntry(entry.id, { title: "After update unique" });

    const hits = db
      .prepare(`SELECT rowid FROM activity_entries_fts WHERE activity_entries_fts MATCH 'unique'`)
      .all() as any[];
    const hasOurEntry = hits.some((h: any) => h.rowid === entry.id);
    expect(hasOurEntry).toBe(true);
  });
});
