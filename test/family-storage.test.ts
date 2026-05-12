// Stage 17 — family storage CRUD tests
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  _setFamilyTestDb,
  _resetFamilyDbForTest,
  createFamilyEvent,
  getFamilyEvent,
  patchFamilyEvent,
  deleteFamilyEvent,
  listFamilyEvents,
  upsertFamilyDayNote,
  getFamilyDayNote,
  upsertFamilyWeekNote,
  getFamilyWeekNote,
  createPublicCalendarBlock,
  deletePublicCalendarBlock,
  listPublicCalendarBlocks,
} from "../server/family-storage";

function makeTestDb() {
  const db = new Database(":memory:");
  return db;
}

describe("family events", () => {
  beforeEach(() => {
    _setFamilyTestDb(makeTestDb());
  });
  afterEach(() => {
    _resetFamilyDbForTest();
  });

  it("creates and retrieves a family event", () => {
    const ev = createFamilyEvent({
      title: "School run",
      start_utc: "2026-06-01T22:00:00Z",
      end_utc: "2026-06-01T23:00:00Z",
      added_by: "password",
    });
    expect(ev.id).toBeGreaterThan(0);
    expect(ev.title).toBe("School run");
    const fetched = getFamilyEvent(ev.id);
    expect(fetched?.title).toBe("School run");
  });

  it("lists events in window", () => {
    createFamilyEvent({
      title: "Inside",
      start_utc: "2026-06-01T22:00:00Z",
      end_utc: "2026-06-01T23:00:00Z",
    });
    createFamilyEvent({
      title: "Outside",
      start_utc: "2026-09-01T22:00:00Z",
      end_utc: "2026-09-01T23:00:00Z",
    });
    const result = listFamilyEvents("2026-06-01T00:00:00Z", "2026-07-01T00:00:00Z");
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Inside");
  });

  it("patches a family event", () => {
    const ev = createFamilyEvent({
      title: "Original",
      start_utc: "2026-06-01T22:00:00Z",
      end_utc: "2026-06-01T23:00:00Z",
    });
    const updated = patchFamilyEvent(ev.id, { title: "Updated" });
    expect(updated?.title).toBe("Updated");
  });

  it("deletes a family event", () => {
    const ev = createFamilyEvent({
      title: "ToDelete",
      start_utc: "2026-06-01T22:00:00Z",
      end_utc: "2026-06-01T23:00:00Z",
    });
    const ok = deleteFamilyEvent(ev.id);
    expect(ok).toBe(true);
    expect(getFamilyEvent(ev.id)).toBeNull();
  });

  it("rejects empty title", () => {
    expect(() =>
      createFamilyEvent({
        title: "",
        start_utc: "2026-06-01T22:00:00Z",
        end_utc: "2026-06-01T23:00:00Z",
      }),
    ).toThrow("title required");
  });

  it("rejects start >= end", () => {
    expect(() =>
      createFamilyEvent({
        title: "Bad",
        start_utc: "2026-06-01T23:00:00Z",
        end_utc: "2026-06-01T22:00:00Z",
      }),
    ).toThrow("start_utc must be before end_utc");
  });

  it("rejects window > 30 days", () => {
    expect(() =>
      createFamilyEvent({
        title: "TooLong",
        start_utc: "2026-06-01T00:00:00Z",
        end_utc: "2026-09-01T00:00:00Z",
      }),
    ).toThrow("max 30 days");
  });
});

describe("family day notes", () => {
  beforeEach(() => {
    _setFamilyTestDb(makeTestDb());
  });
  afterEach(() => {
    _resetFamilyDbForTest();
  });

  it("upserts and retrieves a day note", () => {
    const note = upsertFamilyDayNote("2026-06-01", "Kids home at 3pm", "password");
    expect(note?.body).toBe("Kids home at 3pm");
    const fetched = getFamilyDayNote("2026-06-01");
    expect(fetched?.body).toBe("Kids home at 3pm");
  });

  it("overwrites existing day note", () => {
    upsertFamilyDayNote("2026-06-01", "First note", "token");
    upsertFamilyDayNote("2026-06-01", "Second note", "token");
    const note = getFamilyDayNote("2026-06-01");
    expect(note?.body).toBe("Second note");
  });

  it("empty body deletes the note", () => {
    upsertFamilyDayNote("2026-06-01", "Has content", "token");
    const result = upsertFamilyDayNote("2026-06-01", "", "token");
    expect(result).toBeNull();
    expect(getFamilyDayNote("2026-06-01")).toBeNull();
  });
});

describe("family week notes", () => {
  beforeEach(() => {
    _setFamilyTestDb(makeTestDb());
  });
  afterEach(() => {
    _resetFamilyDbForTest();
  });

  it("upserts and retrieves a week note", () => {
    const note = upsertFamilyWeekNote("2026-W23", "Big week ahead", "password");
    expect(note?.body).toBe("Big week ahead");
    const fetched = getFamilyWeekNote("2026-W23");
    expect(fetched?.body).toBe("Big week ahead");
  });

  it("empty body deletes the week note", () => {
    upsertFamilyWeekNote("2026-W23", "Something", "token");
    const result = upsertFamilyWeekNote("2026-W23", "   ", "token");
    expect(result).toBeNull();
    expect(getFamilyWeekNote("2026-W23")).toBeNull();
  });
});

describe("public_calendar_blocks", () => {
  beforeEach(() => {
    _setFamilyTestDb(makeTestDb());
  });
  afterEach(() => {
    _resetFamilyDbForTest();
  });

  it("creates and lists a block", () => {
    createPublicCalendarBlock({
      kind: "force_busy",
      start_utc: "2026-06-01T00:00:00Z",
      end_utc: "2026-06-01T02:00:00Z",
    });
    const blocks = listPublicCalendarBlocks();
    expect(blocks.length).toBe(1);
    expect(blocks[0].kind).toBe("force_busy");
  });

  it("deletes a block", () => {
    const b = createPublicCalendarBlock({ kind: "rule_off_day", weekday: 3 });
    const ok = deletePublicCalendarBlock(b.id);
    expect(ok).toBe(true);
    expect(listPublicCalendarBlocks().length).toBe(0);
  });
});
