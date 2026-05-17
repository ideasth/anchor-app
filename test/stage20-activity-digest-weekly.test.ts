// Stage 20 (2026-05-17) — Weekly digest: aggregates, write, dry-run shape.

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

describe("Stage 20 — weekly digest", () => {
  beforeEach(setup);

  it("buildWeeklyDigest returns expected shape", async () => {
    const { createEntry } = await import("../server/activity/service");
    const { buildWeeklyDigest } = await import("../server/activity/digest/weekly");
    createEntry({ entryDate: "2026-05-14", title: "Mid week", categoryId: 1, status: "Complete", durationMinutes: 60 });
    const payload = buildWeeklyDigest("2026-W20");
    expect(payload.isoWeek).toBe("2026-W20");
    expect(payload.from).toBe("2026-05-11");
    expect(payload.to).toBe("2026-05-17");
    expect(typeof payload.totalMinutes).toBe("number");
    expect(Array.isArray(payload.byCategory)).toBe(true);
    expect(Array.isArray(payload.topEntries)).toBe(true);
  });

  it("buildWeeklyDigest includes entries in topEntries (max 10)", async () => {
    const { createEntry } = await import("../server/activity/service");
    const { buildWeeklyDigest } = await import("../server/activity/digest/weekly");
    for (let i = 0; i < 12; i++) {
      createEntry({ entryDate: "2026-05-14", title: `Entry ${i}`, categoryId: 1, status: "Complete", durationMinutes: i + 1 });
    }
    const payload = buildWeeklyDigest("2026-W20");
    expect(payload.topEntries.length).toBeLessThanOrEqual(10);
  });

  it("writeDigest writes a row to activity_digests", async () => {
    const { createEntry } = await import("../server/activity/service");
    const { buildWeeklyDigest, writeDigest, getDigest } = await import("../server/activity/digest/weekly");
    createEntry({ entryDate: "2026-05-14", title: "Digest entry", categoryId: 1, status: "Complete", durationMinutes: 30 });
    const payload = buildWeeklyDigest("2026-W20");
    const { id } = writeDigest(payload, "Test narrative.", "manual");
    expect(id).toBeTypeOf("number");
    const stored = getDigest(id);
    expect(stored?.isoWeek).toBe("2026-W20");
    expect(stored?.narrative).toBe("Test narrative.");
    expect(stored?.source).toBe("manual");
  });

  it("buildWeeklyDigestPrompt returns model and messages", async () => {
    const { createEntry } = await import("../server/activity/service");
    const { buildWeeklyDigest } = await import("../server/activity/digest/weekly");
    const { buildWeeklyDigestPrompt } = await import("../server/activity/digest/weekly-prompt");
    createEntry({ entryDate: "2026-05-14", title: "Prompt test", categoryId: 1, status: "Complete", durationMinutes: 45 });
    const payload = buildWeeklyDigest("2026-W20");
    const prompt = buildWeeklyDigestPrompt(payload);
    expect(prompt.model).toBe("sonar-pro");
    expect(Array.isArray(prompt.messages)).toBe(true);
    expect(prompt.messages[0].role).toBe("system");
    expect(prompt.messages[1].role).toBe("user");
    expect(prompt.messages[1].content).toContain("2026-W20");
  });
});
