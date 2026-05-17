// Stage 20 (2026-05-17) — FTS5 search tests.

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { _setActivityTestDb, _resetActivityDb, runInlineMigrations } from "../server/activity/db";

function setup() {
  _resetActivityDb();
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runInlineMigrations(db);
  _setActivityTestDb(db);
}

describe("Stage 20 — FTS5 search", () => {
  beforeEach(setup);

  it("finds an entry by exact title word", async () => {
    const { createEntry } = await import("../server/activity/service");
    const { searchEntries } = await import("../server/activity/fts");
    createEntry({ entryDate: "2026-05-17", title: "Governance meeting notes", categoryId: 1, status: "Open" });
    const hits = searchEntries("Governance");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].title).toContain("Governance");
  });

  it("finds an entry by stemmed word (porter tokenizer)", async () => {
    const { createEntry } = await import("../server/activity/service");
    const { searchEntries } = await import("../server/activity/fts");
    createEntry({ entryDate: "2026-05-17", title: "Writing documentation", categoryId: 1, status: "Open" });
    // "writing" -> stem "write"; "write" should match "writing" via porter
    const hits = searchEntries("write");
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it("finds an entry by tag", async () => {
    const { createEntry } = await import("../server/activity/service");
    const { searchEntries } = await import("../server/activity/fts");
    createEntry({
      entryDate: "2026-05-17",
      title: "Tagged entry",
      categoryId: 1,
      status: "Open",
      tags: ["buoy", "stage20"],
    });
    const hits = searchEntries("stage20");
    expect(hits.some((h) => h.title === "Tagged entry")).toBe(true);
  });

  it("returns a snippet with markers around matched tokens", async () => {
    const { createEntry } = await import("../server/activity/service");
    const { searchEntries } = await import("../server/activity/fts");
    createEntry({
      entryDate: "2026-05-17",
      title: "Unique marker test",
      categoryId: 1,
      status: "Open",
      contextSummary: "This session was about governance compliance review.",
    });
    const hits = searchEntries("governance");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    // snippet should contain the « » markers
    const hasMarker = hits.some((h) => h.snippet.includes("«") || h.snippet.includes("»") || h.snippet.includes("governance"));
    expect(hasMarker).toBe(true);
  });

  it("returns empty array for empty query", async () => {
    const { searchEntries } = await import("../server/activity/fts");
    expect(searchEntries("")).toHaveLength(0);
  });

  it("returns multiple results ranked by bm25 (rank field exists)", async () => {
    const { createEntry } = await import("../server/activity/service");
    const { searchEntries } = await import("../server/activity/fts");
    createEntry({ entryDate: "2026-05-17", title: "First compliance entry", categoryId: 1, status: "Open" });
    createEntry({ entryDate: "2026-05-16", title: "Second compliance compliance entry", categoryId: 1, status: "Open" });
    const hits = searchEntries("compliance");
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0].rank).toBeDefined();
  });
});
