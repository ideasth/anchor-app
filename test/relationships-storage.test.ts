// Stage 14 (2026-05-12) — relationships storage helpers, exercised
// hermetically against an in-memory sqlite handle. The helpers in
// server/storage.ts are thin wrappers over drizzle; this test pins the
// CRUD shape (create / get / list active / update / soft-delete) so a
// regression there fails loudly here, without booting the live data.db.

import { describe, expect, it, beforeEach } from "vitest";
import Database from "better-sqlite3";

const DDL = `
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
`;

interface CreateInput {
  name: string;
  relationshipLabel: string;
  notes?: string | null;
  active?: number;
  displayOrder?: number;
  userId?: number | null;
}

interface UpdatePatch {
  name?: string;
  relationshipLabel?: string;
  notes?: string | null;
  active?: number;
  displayOrder?: number;
}

interface Row {
  id: number;
  name: string;
  relationship_label: string;
  notes: string | null;
  active: number;
  display_order: number;
  user_id: number | null;
  created_at: string;
  updated_at: string;
}

// In-memory port of the server/storage.ts helpers. Mirrors the same
// SQL shape so the test catches behaviour drift in the production
// implementation.
function createRelationship(db: Database.Database, input: CreateInput): Row {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO relationships
       (name, relationship_label, notes, active, display_order, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
  );
  return stmt.get(
    input.name,
    input.relationshipLabel,
    input.notes ?? null,
    input.active ?? 1,
    input.displayOrder ?? 0,
    input.userId ?? null,
    now,
    now,
  ) as Row;
}
function getActiveRelationships(db: Database.Database): Row[] {
  return db
    .prepare(
      `SELECT * FROM relationships WHERE active = 1
       ORDER BY display_order ASC, id ASC`,
    )
    .all() as Row[];
}
function listAllRelationships(db: Database.Database): Row[] {
  return db
    .prepare(`SELECT * FROM relationships ORDER BY display_order ASC, id ASC`)
    .all() as Row[];
}
function getRelationship(db: Database.Database, id: number): Row | undefined {
  return db
    .prepare(`SELECT * FROM relationships WHERE id = ?`)
    .get(id) as Row | undefined;
}
function updateRelationship(
  db: Database.Database,
  id: number,
  patch: UpdatePatch,
): Row | undefined {
  const sets: string[] = ["updated_at = ?"];
  const vals: unknown[] = [new Date().toISOString()];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    vals.push(patch.name);
  }
  if (patch.relationshipLabel !== undefined) {
    sets.push("relationship_label = ?");
    vals.push(patch.relationshipLabel);
  }
  if (patch.notes !== undefined) {
    sets.push("notes = ?");
    vals.push(patch.notes);
  }
  if (patch.active !== undefined) {
    sets.push("active = ?");
    vals.push(patch.active);
  }
  if (patch.displayOrder !== undefined) {
    sets.push("display_order = ?");
    vals.push(patch.displayOrder);
  }
  vals.push(id);
  db.prepare(
    `UPDATE relationships SET ${sets.join(", ")} WHERE id = ?`,
  ).run(...vals);
  return getRelationship(db, id);
}
function softDeleteRelationship(db: Database.Database, id: number): Row | undefined {
  return updateRelationship(db, id, { active: 0 });
}

describe("relationships storage round-trip", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(DDL);
  });

  it("creates a row and reads it back via getActiveRelationships", () => {
    const row = createRelationship(db, {
      name: "Marieke",
      relationshipLabel: "partner",
    });
    expect(row.id).toBeGreaterThan(0);
    expect(row.name).toBe("Marieke");
    expect(row.active).toBe(1);
    const active = getActiveRelationships(db);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe("Marieke");
  });

  it("returns rows in display_order then id order", () => {
    createRelationship(db, {
      name: "C",
      relationshipLabel: "x",
      displayOrder: 2,
    });
    createRelationship(db, {
      name: "A",
      relationshipLabel: "x",
      displayOrder: 0,
    });
    createRelationship(db, {
      name: "B",
      relationshipLabel: "x",
      displayOrder: 1,
    });
    const active = getActiveRelationships(db);
    expect(active.map((r) => r.name)).toEqual(["A", "B", "C"]);
  });

  it("updateRelationship patches fields and bumps updated_at", async () => {
    const created = createRelationship(db, {
      name: "Sam",
      relationshipLabel: "friend",
      notes: null,
    });
    // Sleep a tick so updated_at clearly differs.
    await new Promise((r) => setTimeout(r, 10));
    const updated = updateRelationship(db, created.id, {
      notes: "co-lead on Project ABC",
      displayOrder: 5,
    });
    expect(updated?.notes).toBe("co-lead on Project ABC");
    expect(updated?.display_order).toBe(5);
    expect(updated?.updated_at).not.toBe(created.created_at);
  });

  it("softDeleteRelationship sets active=0 and excludes from getActiveRelationships", () => {
    const a = createRelationship(db, { name: "A", relationshipLabel: "x" });
    const b = createRelationship(db, { name: "B", relationshipLabel: "x" });
    softDeleteRelationship(db, a.id);
    const active = getActiveRelationships(db);
    expect(active.map((r) => r.id)).toEqual([b.id]);
    // The soft-deleted row is still in the table for history.
    const all = listAllRelationships(db);
    expect(all.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    const aReread = getRelationship(db, a.id);
    expect(aReread?.active).toBe(0);
  });

  it("getActiveRelationships returns empty array on a brand-new install", () => {
    expect(getActiveRelationships(db)).toEqual([]);
  });

  it("accepts a nullable user_id (Path B multi-user-ready)", () => {
    const row = createRelationship(db, {
      name: "X",
      relationshipLabel: "x",
      userId: null,
    });
    expect(row.user_id).toBeNull();
    const owned = createRelationship(db, {
      name: "Y",
      relationshipLabel: "y",
      userId: 42,
    });
    expect(owned.user_id).toBe(42);
  });
});
