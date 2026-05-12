// Stage 13a (2026-05-12) — Calm pre/post chip schema migrations.
//
// Verifies that the additive ALTER TABLEs in server/storage.ts bring an
// older coach_sessions schema up to the Stage 13a shape without data
// loss, and that a second boot is a no-op. Hermetic — uses an in-memory
// sqlite handle and re-implements only the column-adds being tested.

import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";

// Pre-Stage-13a DDL (the shape that lives on disk for a database
// already migrated to Stage 13 but not yet Stage 13a).
const PRE_STAGE_13A_DDL = `
CREATE TABLE coach_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  mode TEXT NOT NULL DEFAULT 'plan',
  context_snapshot TEXT NOT NULL DEFAULT '{}',
  summary TEXT,
  summary_edited_by_user INTEGER NOT NULL DEFAULT 0,
  linked_issue_id INTEGER,
  linked_ymd TEXT,
  model_provider TEXT NOT NULL DEFAULT 'perplexity',
  model_name TEXT NOT NULL DEFAULT 'sonar-pro',
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  deep_think INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER,
  calm_variant TEXT,
  issue_entity_type TEXT,
  issue_entity_id INTEGER,
  issue_freetext TEXT,
  pre_tags TEXT,
  pre_intensity INTEGER,
  grounding_observations TEXT,
  reframe_text TEXT,
  reflection_worst_story TEXT,
  reflection_accurate_story TEXT,
  reflection_next_action TEXT,
  post_tags TEXT,
  post_intensity INTEGER,
  post_note TEXT,
  completed_at INTEGER
);
`;

const STAGE_13A_ADDS = [
  "ALTER TABLE coach_sessions ADD COLUMN calm_pre_arousal TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_pre_energy TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_pre_sleep TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_pre_mood TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_pre_cognitive_load TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_pre_focus TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_pre_alignment_people TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_pre_alignment_values TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_pre_mind_categories TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_pre_mind_other_label TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_pre_brain_dump TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_post_arousal TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_post_energy TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_post_sleep TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_post_mood TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_post_cognitive_load TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_post_focus TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_post_alignment_people TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_post_alignment_values TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_post_mind_categories TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_post_mind_other_label TEXT",
  "ALTER TABLE coach_sessions ADD COLUMN calm_post_brain_dump TEXT",
];

function applyIdempotently(db: Database.Database) {
  for (const stmt of STAGE_13A_ADDS) {
    try {
      db.exec(stmt);
    } catch {
      // Column already exists — ignore. Mirrors server/storage.ts pattern.
    }
  }
}

describe("Stage 13a chip-column migration", () => {
  it("adds all 22 chip columns to a Stage-13 coach_sessions table", () => {
    const db = new Database(":memory:");
    db.exec(PRE_STAGE_13A_DDL);
    applyIdempotently(db);
    const cols = db
      .prepare("PRAGMA table_info(coach_sessions)")
      .all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    for (const expected of [
      "calm_pre_arousal",
      "calm_pre_energy",
      "calm_pre_sleep",
      "calm_pre_mood",
      "calm_pre_cognitive_load",
      "calm_pre_focus",
      "calm_pre_alignment_people",
      "calm_pre_alignment_values",
      "calm_pre_mind_categories",
      "calm_pre_mind_other_label",
      "calm_pre_brain_dump",
      "calm_post_arousal",
      "calm_post_energy",
      "calm_post_sleep",
      "calm_post_mood",
      "calm_post_cognitive_load",
      "calm_post_focus",
      "calm_post_alignment_people",
      "calm_post_alignment_values",
      "calm_post_mind_categories",
      "calm_post_mind_other_label",
      "calm_post_brain_dump",
    ]) {
      expect(names, `column ${expected} should be added`).toContain(expected);
    }
  });

  it("keeps the deprecated pre_intensity / post_intensity columns intact", () => {
    const db = new Database(":memory:");
    db.exec(PRE_STAGE_13A_DDL);
    applyIdempotently(db);
    const cols = db
      .prepare("PRAGMA table_info(coach_sessions)")
      .all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    expect(names).toContain("pre_intensity");
    expect(names).toContain("post_intensity");
  });

  it("is idempotent: a second boot is a silent no-op", () => {
    const db = new Database(":memory:");
    db.exec(PRE_STAGE_13A_DDL);
    applyIdempotently(db);
    expect(() => applyIdempotently(db)).not.toThrow();
  });

  it("migrates a DB that already has a populated Stage-13 calm session without loss", () => {
    const db = new Database(":memory:");
    db.exec(PRE_STAGE_13A_DDL);
    db.prepare(
      `INSERT INTO coach_sessions
         (started_at, mode, calm_variant, issue_entity_type, issue_freetext,
          pre_tags, pre_intensity, post_tags, post_intensity, completed_at,
          context_snapshot, model_provider, model_name)
       VALUES (?, 'calm', 'grounding_only', 'freetext', 'shoulder ache',
               ?, 7, ?, 3, ?, '{}', 'perplexity', 'sonar-pro')`,
    ).run(
      1_700_000_000_000,
      JSON.stringify(["overwhelmed"]),
      JSON.stringify(["calmer"]),
      1_700_000_060_000,
    );
    applyIdempotently(db);
    const row = db
      .prepare("SELECT * FROM coach_sessions LIMIT 1")
      .get() as Record<string, unknown>;
    // Old fields preserved.
    expect(row.issue_freetext).toBe("shoulder ache");
    expect(row.pre_intensity).toBe(7);
    expect(row.post_intensity).toBe(3);
    // New columns added and currently null.
    expect(row.calm_pre_arousal).toBeNull();
    expect(row.calm_post_mood).toBeNull();
    expect(row.calm_pre_mind_categories).toBeNull();
  });

  it("accepts NULL for every new chip column", () => {
    const db = new Database(":memory:");
    db.exec(PRE_STAGE_13A_DDL);
    applyIdempotently(db);
    db.prepare(
      `INSERT INTO coach_sessions (started_at, mode, context_snapshot, model_provider, model_name)
       VALUES (?, 'calm', '{}', 'perplexity', 'sonar-pro')`,
    ).run(Date.now());
    const row = db
      .prepare("SELECT * FROM coach_sessions WHERE mode = 'calm'")
      .get() as Record<string, unknown>;
    for (const col of [
      "calm_pre_arousal",
      "calm_pre_energy",
      "calm_pre_sleep",
      "calm_pre_mood",
      "calm_pre_cognitive_load",
      "calm_pre_focus",
      "calm_pre_alignment_people",
      "calm_pre_alignment_values",
      "calm_pre_mind_categories",
      "calm_pre_mind_other_label",
      "calm_pre_brain_dump",
      "calm_post_arousal",
      "calm_post_energy",
      "calm_post_sleep",
      "calm_post_mood",
      "calm_post_cognitive_load",
      "calm_post_focus",
      "calm_post_alignment_people",
      "calm_post_alignment_values",
      "calm_post_mind_categories",
      "calm_post_mind_other_label",
      "calm_post_brain_dump",
    ]) {
      expect(row[col], `${col} should default to NULL`).toBeNull();
    }
  });

  it("round-trips mind_categories as a JSON array string", () => {
    const db = new Database(":memory:");
    db.exec(PRE_STAGE_13A_DDL);
    applyIdempotently(db);
    const cats = ["Relationship", "Kids", "Other"];
    db.prepare(
      `INSERT INTO coach_sessions
         (started_at, mode, context_snapshot, model_provider, model_name,
          calm_pre_mind_categories, calm_pre_mind_other_label, calm_pre_brain_dump)
       VALUES (?, 'calm', '{}', 'perplexity', 'sonar-pro', ?, ?, ?)`,
    ).run(Date.now(), JSON.stringify(cats), "the leak in the kitchen", "long week");
    const row = db
      .prepare(
        "SELECT calm_pre_mind_categories, calm_pre_mind_other_label, calm_pre_brain_dump FROM coach_sessions",
      )
      .get() as {
      calm_pre_mind_categories: string;
      calm_pre_mind_other_label: string;
      calm_pre_brain_dump: string;
    };
    expect(JSON.parse(row.calm_pre_mind_categories)).toEqual(cats);
    expect(row.calm_pre_mind_other_label).toBe("the leak in the kitchen");
    expect(row.calm_pre_brain_dump).toBe("long week");
  });
});
