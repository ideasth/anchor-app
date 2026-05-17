// Stage 20 (2026-05-17) — Reports aggregate tests.

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

describe("Stage 20 — reports", () => {
  beforeEach(setup);

  it("reportDay returns totals for the given date", async () => {
    const { createEntry } = await import("../server/activity/service");
    const { reportDay } = await import("../server/activity/reports");
    createEntry({ entryDate: "2026-05-17", title: "E1", categoryId: 1, status: "Complete", durationMinutes: 30 });
    createEntry({ entryDate: "2026-05-17", title: "E2", categoryId: 1, status: "Open", durationMinutes: 45 });
    createEntry({ entryDate: "2026-05-16", title: "Other day", categoryId: 1, status: "Complete", durationMinutes: 60 });
    const report = reportDay("2026-05-17");
    expect(report.totalMinutes).toBe(75);
    expect(report.countByStatus["Complete"]).toBe(1);
    expect(report.countByStatus["Open"]).toBe(1);
  });

  it("reportWeek returns totals for a week", async () => {
    const { createEntry } = await import("../server/activity/service");
    const { reportWeek } = await import("../server/activity/reports");
    // 2026-W20 starts Mon 2026-05-11, ends Sun 2026-05-17
    createEntry({ entryDate: "2026-05-14", title: "Mid week", categoryId: 1, status: "Complete", durationMinutes: 60 });
    createEntry({ entryDate: "2026-05-17", title: "End of week", categoryId: 1, status: "Open", durationMinutes: 90 });
    const report = reportWeek("2026-W20");
    expect(report.totalMinutes).toBeGreaterThanOrEqual(150);
  });

  it("reportByCategory aggregates minutes per category", async () => {
    const { createEntry } = await import("../server/activity/service");
    const { reportByCategory } = await import("../server/activity/reports");
    createEntry({ entryDate: "2026-05-17", title: "Work entry", categoryId: 1, status: "Complete", durationMinutes: 30 });
    createEntry({ entryDate: "2026-05-17", title: "Home entry", categoryId: 2, status: "Complete", durationMinutes: 20 });
    const rows = reportByCategory("2026-05-01", "2026-05-31");
    const work = rows.find((r) => r.categoryId === 1);
    expect(work?.minutes).toBeGreaterThanOrEqual(30);
  });

  it("reportBySubcategory aggregates minutes per subcategory", async () => {
    const { createEntry } = await import("../server/activity/service");
    const { reportBySubcategory } = await import("../server/activity/reports");
    createEntry({ entryDate: "2026-05-17", title: "Sub entry", categoryId: 1, subcategoryId: 1, status: "Complete", durationMinutes: 45 });
    const rows = reportBySubcategory("2026-05-01", "2026-05-31");
    const sub = rows.find((r) => r.subcategoryId === 1);
    expect(sub?.minutes).toBeGreaterThanOrEqual(45);
  });

  it("reportBySource aggregates minutes per source kind", async () => {
    const { createEntry } = await import("../server/activity/service");
    const { reportBySource } = await import("../server/activity/reports");
    createEntry({
      entryDate: "2026-05-17",
      title: "Thread entry",
      categoryId: 1,
      status: "Complete",
      durationMinutes: 25,
      source: { kind: "perplexity_thread", externalId: "thread123" },
    });
    const rows = reportBySource("2026-05-01", "2026-05-31");
    const thread = rows.find((r) => r.sourceKind === "perplexity_thread");
    expect(thread?.minutes).toBeGreaterThanOrEqual(25);
  });

  it("reportByRelationship aggregates minutes per relationship ID", async () => {
    const { createEntry } = await import("../server/activity/service");
    const { reportByRelationship } = await import("../server/activity/reports");
    createEntry({
      entryDate: "2026-05-17",
      title: "Relationship entry",
      categoryId: 1,
      status: "Complete",
      durationMinutes: 60,
      buoyRelationshipId: "42",
    });
    const rows = reportByRelationship("2026-05-01", "2026-05-31");
    const rel = rows.find((r) => r.buoyRelationshipId === "42");
    expect(rel?.minutes).toBeGreaterThanOrEqual(60);
  });

  it("isoWeekToDateRange returns correct Mon–Sun range", async () => {
    const { isoWeekToDateRange } = await import("../server/activity/reports");
    const { from, to } = isoWeekToDateRange("2026-W20");
    // W20 2026: Mon 2026-05-11 – Sun 2026-05-17
    expect(from).toBe("2026-05-11");
    expect(to).toBe("2026-05-17");
  });
});
