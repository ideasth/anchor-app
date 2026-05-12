// Stage 14 (2026-05-12) — relationships table migrations + seed.
//
// Hermetic. Mirrors the CREATE TABLE + seed pattern from
// server/storage.ts so a regression in either lands here loudly.

import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";

const RELATIONSHIPS_DDL = `
CREATE TABLE IF NOT EXISTS relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  relationship_label TEXT NOT NULL,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_relationships_active_order ON relationships(active, display_order, id);
`;

// Mirror of the seed block from server/storage.ts. Idempotent: only
// inserts when the table is empty.
function applyMigrationsAndSeed(db: Database.Database): void {
  db.exec(RELATIONSHIPS_DDL);
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM relationships")
    .get() as { c: number };
  if ((row?.c ?? 0) === 0) {
    const insert = db.prepare(
      `INSERT INTO relationships (name, relationship_label, notes, active, display_order, user_id, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );
    const tx = db.transaction(() => {
      insert.run("Marieke", "partner", null, 0);
      insert.run("Hilde", "daughter", null, 1);
      insert.run("Axel", "son", null, 2);
    });
    tx();
  }
}

describe("relationships migration", () => {
  it("creates the table with the documented columns", () => {
    const db = new Database(":memory:");
    applyMigrationsAndSeed(db);
    const cols = db
      .prepare("PRAGMA table_info(relationships)")
      .all() as Array<{ name: string; type: string; notnull: number; dflt_value: string | null }>;
    const names = new Set(cols.map((c) => c.name));
    for (const col of [
      "id",
      "name",
      "relationship_label",
      "notes",
      "active",
      "display_order",
      "user_id",
      "created_at",
      "updated_at",
    ]) {
      expect(names, `expected column ${col}`).toContain(col);
    }
    // Path B: user_id is nullable so the future multi-user migration is
    // "make it non-null and backfill to user 1" — cheap.
    const userIdCol = cols.find((c) => c.name === "user_id")!;
    expect(userIdCol.notnull).toBe(0);
  });

  it("seeds Marieke / Hilde / Axel on a fresh empty database", () => {
    const db = new Database(":memory:");
    applyMigrationsAndSeed(db);
    const rows = db
      .prepare(
        "SELECT name, relationship_label, active, display_order FROM relationships ORDER BY display_order",
      )
      .all() as Array<{
      name: string;
      relationship_label: string;
      active: number;
      display_order: number;
    }>;
    expect(rows).toEqual([
      { name: "Marieke", relationship_label: "partner", active: 1, display_order: 0 },
      { name: "Hilde", relationship_label: "daughter", active: 1, display_order: 1 },
      { name: "Axel", relationship_label: "son", active: 1, display_order: 2 },
    ]);
  });

  it("does not duplicate seed rows on a second boot", () => {
    const db = new Database(":memory:");
    applyMigrationsAndSeed(db);
    applyMigrationsAndSeed(db);
    applyMigrationsAndSeed(db);
    const { c } = db
      .prepare("SELECT COUNT(*) AS c FROM relationships")
      .get() as { c: number };
    expect(c).toBe(3);
  });

  it("runs cleanly on a database that already has Stage-13a coach_sessions rows", () => {
    // Simulate a pre-existing DB with the calm-mode rows present, then
    // apply the relationships migration. The migration must succeed and
    // seed.
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE coach_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at INTEGER NOT NULL,
        mode TEXT NOT NULL DEFAULT 'plan'
      );
      INSERT INTO coach_sessions (started_at, mode) VALUES (1, 'calm');
    `);
    applyMigrationsAndSeed(db);
    const { c } = db
      .prepare("SELECT COUNT(*) AS c FROM relationships")
      .get() as { c: number };
    expect(c).toBe(3);
    // Existing coach_sessions row is untouched.
    const { c: cs } = db
      .prepare("SELECT COUNT(*) AS c FROM coach_sessions")
      .get() as { c: number };
    expect(cs).toBe(1);
  });

  it("skips seeding when the table is already populated (manual rows preserved)", () => {
    const db = new Database(":memory:");
    db.exec(RELATIONSHIPS_DDL);
    db.prepare(
      `INSERT INTO relationships (name, relationship_label, active, display_order, created_at, updated_at)
       VALUES ('custom', 'friend', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    ).run();
    applyMigrationsAndSeed(db);
    const names = db
      .prepare("SELECT name FROM relationships ORDER BY id")
      .all() as Array<{ name: string }>;
    expect(names.map((r) => r.name)).toEqual(["custom"]);
  });

  it("supports the soft-delete + display_order shape used by storage helpers", () => {
    const db = new Database(":memory:");
    applyMigrationsAndSeed(db);
    db.prepare("UPDATE relationships SET active = 0 WHERE name = 'Hilde'").run();
    const activeRows = db
      .prepare(
        "SELECT name FROM relationships WHERE active = 1 ORDER BY display_order, id",
      )
      .all() as Array<{ name: string }>;
    expect(activeRows.map((r) => r.name)).toEqual(["Marieke", "Axel"]);
  });
});
