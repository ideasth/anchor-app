// Stage 20 (2026-05-17) — Activity service: CRUD, timers, validation.

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

describe("Stage 20 — activity service: CRUD", () => {
  beforeEach(setup);

  it("creates an entry with required fields", async () => {
    const { createEntry } = await import("../server/activity/service");
    const entry = createEntry({
      entryDate: "2026-05-17",
      title: "Test entry",
      categoryId: 1,
      status: "Open",
    });
    expect(entry.id).toBeTypeOf("number");
    expect(entry.title).toBe("Test entry");
    expect(entry.status).toBe("Open");
    expect(entry.tagsJson).toBe("[]");
  });

  it("getEntry returns the created entry", async () => {
    const { createEntry, getEntry } = await import("../server/activity/service");
    const entry = createEntry({ entryDate: "2026-05-17", title: "Get test", categoryId: 1, status: "Open" });
    const fetched = getEntry(entry.id);
    expect(fetched?.id).toBe(entry.id);
    expect(fetched?.title).toBe("Get test");
  });

  it("updateEntry modifies the entry", async () => {
    const { createEntry, updateEntry, getEntry } = await import("../server/activity/service");
    const entry = createEntry({ entryDate: "2026-05-17", title: "Before", categoryId: 1, status: "Open" });
    updateEntry(entry.id, { title: "After", status: "Complete" });
    const updated = getEntry(entry.id);
    expect(updated?.title).toBe("After");
    expect(updated?.status).toBe("Complete");
  });

  it("deleteEntry removes the entry", async () => {
    const { createEntry, deleteEntry, getEntry } = await import("../server/activity/service");
    const entry = createEntry({ entryDate: "2026-05-17", title: "Delete me", categoryId: 1, status: "Open" });
    const deleted = deleteEntry(entry.id);
    expect(deleted).toBe(true);
    expect(getEntry(entry.id)).toBeNull();
  });

  it("listEntries returns entries ordered by date desc", async () => {
    const { createEntry, listEntries } = await import("../server/activity/service");
    createEntry({ entryDate: "2026-05-15", title: "Older", categoryId: 1, status: "Open" });
    createEntry({ entryDate: "2026-05-17", title: "Newer", categoryId: 1, status: "Open" });
    const entries = listEntries();
    expect(entries[0].entryDate >= entries[entries.length - 1].entryDate).toBe(true);
  });

  it("validateTitle rejects titles over 200 chars", async () => {
    const { validateTitle } = await import("../server/activity/service");
    expect(() => validateTitle("x".repeat(201))).toThrow(/200/);
  });

  it("validateTitle accepts exactly 200 chars", async () => {
    const { validateTitle } = await import("../server/activity/service");
    const title = validateTitle("x".repeat(200));
    expect(title.length).toBe(200);
  });

  it("validateTags rejects arrays over 20 items", async () => {
    const { validateTags } = await import("../server/activity/service");
    expect(() => validateTags(new Array(21).fill("a"))).toThrow(/20/);
  });

  it("validateTags rejects tags over 40 chars", async () => {
    const { validateTags } = await import("../server/activity/service");
    expect(() => validateTags(["x".repeat(41)])).toThrow(/40/);
  });

  it("createEntry computes duration from start/end when durationMinutes not given", async () => {
    const { createEntry } = await import("../server/activity/service");
    const entry = createEntry({
      entryDate: "2026-05-17",
      title: "Duration test",
      categoryId: 1,
      status: "Complete",
      startUtc: "2026-05-17T10:00:00.000Z",
      endUtc: "2026-05-17T10:30:00.000Z",
    });
    expect(entry.durationMinutes).toBe(30);
  });
});

describe("Stage 20 — activity service: timers", () => {
  beforeEach(setup);

  it("startTimer auto-stops a previous timer", async () => {
    const { createEntry, startTimer, getCurrentTimer, getEntry } = await import("../server/activity/service");
    const e1 = createEntry({ entryDate: "2026-05-17", title: "Entry 1", categoryId: 1, status: "Open" });
    const e2 = createEntry({ entryDate: "2026-05-17", title: "Entry 2", categoryId: 1, status: "Open" });

    startTimer({ entryId: e1.id });
    expect(getCurrentTimer()?.entryId).toBe(e1.id);

    startTimer({ entryId: e2.id });
    // Previous timer should be stopped (entry 1 should have end_utc set).
    const stopped = getEntry(e1.id);
    expect(stopped?.endUtc).toBeTruthy();
    expect(getCurrentTimer()?.entryId).toBe(e2.id);
  });

  it("stopTimer closes the current timer and sets duration", async () => {
    const { createEntry, startTimer, stopTimer, getCurrentTimer } = await import("../server/activity/service");
    const e = createEntry({ entryDate: "2026-05-17", title: "Timer test", categoryId: 1, status: "Open" });
    startTimer({ entryId: e.id });

    const closed = stopTimer();
    expect(closed?.endUtc).toBeTruthy();
    expect(closed?.durationMinutes).toBeGreaterThanOrEqual(0);
    expect(getCurrentTimer()).toBeNull();
  });
});
