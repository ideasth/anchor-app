// Stage 17 — availability ICS sanitisation tests.
// The public availability ICS must never contain:
// - Family event titles
// - Family note body content
// - Outlook event titles
// - SUMMARY: Busy entries

import { describe, it, expect } from "vitest";
import { emitPublicIcs, computeAvailability, emitFamilyIcs } from "../server/public-calendar";
import type { AvailableBlock } from "../server/public-calendar";
import type { CalEvent } from "../server/ics";
import type { FamilyEvent } from "../server/family-storage";

function makeCalEvent(uid: string, summary: string, start: string, end: string): CalEvent {
  return { uid, summary, start, end, allDay: false };
}

function makeFamilyEvent(id: number, title: string, start: string, end: string): FamilyEvent {
  return {
    id,
    user_id: null,
    title,
    start_utc: start,
    end_utc: end,
    all_day: 0,
    location: null,
    notes: "Secret family note content",
    added_by: "token",
    count_as_busy_for_public: 1,
    created_at: start,
    updated_at: start,
  };
}

describe("public availability ICS sanitisation", () => {
  const BOOKABLE = {
    mon: ["07:00", "19:00"] as [string, string],
    tue: ["07:00", "19:00"] as [string, string],
    wed: ["07:00", "19:00"] as [string, string],
    thu: ["07:00", "19:00"] as [string, string],
    fri: ["07:00", "19:00"] as [string, string],
    sat: ["08:00", "13:00"] as [string, string],
    sun: null,
  };

  it("does not contain Outlook event title in public ICS", () => {
    const calEvent = makeCalEvent(
      "outlook-1",
      "VERY_SECRET_OUTLOOK_EVENT_TITLE",
      "2026-06-01T22:00:00Z", // 08:00 AEST Tue
      "2026-06-01T23:00:00Z",
    );
    const now = new Date("2026-05-31T21:00:00Z").getTime();
    const blocks = computeAvailability({
      calEvents: [calEvent],
      familyEvents: [],
      blocks: [],
      bookableWindow: BOOKABLE,
      now,
      horizonMs: 24 * 60 * 60 * 1000,
    });
    const ics = emitPublicIcs(blocks);
    expect(ics).not.toContain("VERY_SECRET_OUTLOOK_EVENT_TITLE");
  });

  it("does not contain family event title in public ICS", () => {
    const fev = makeFamilyEvent(1, "SECRET_FAMILY_EVENT", "2026-06-01T22:00:00Z", "2026-06-01T23:00:00Z");
    const now = new Date("2026-05-31T21:00:00Z").getTime();
    const blocks = computeAvailability({
      calEvents: [],
      familyEvents: [fev],
      blocks: [],
      bookableWindow: BOOKABLE,
      now,
      horizonMs: 24 * 60 * 60 * 1000,
    });
    const ics = emitPublicIcs(blocks);
    expect(ics).not.toContain("SECRET_FAMILY_EVENT");
  });

  it("does not contain family note body in public ICS", () => {
    const fev = makeFamilyEvent(1, "FamEvent", "2026-06-01T22:00:00Z", "2026-06-01T23:00:00Z");
    const now = new Date("2026-05-31T21:00:00Z").getTime();
    const blocks = computeAvailability({
      calEvents: [],
      familyEvents: [fev],
      blocks: [],
      bookableWindow: BOOKABLE,
      now,
      horizonMs: 24 * 60 * 60 * 1000,
    });
    const ics = emitPublicIcs(blocks);
    expect(ics).not.toContain("Secret family note content");
  });

  it("never emits SUMMARY: Busy in public ICS", () => {
    const ics = emitPublicIcs([]);
    expect(ics).not.toContain("SUMMARY:Busy");
    expect(ics).not.toContain("SUMMARY: Busy");
  });

  it("only emits Available blocks (no private details)", () => {
    const blocks: AvailableBlock[] = [
      { startUtcMs: new Date("2026-06-01T22:00:00Z").getTime(), endUtcMs: new Date("2026-06-01T24:00:00Z").getTime(), durationMin: 120 },
    ];
    const ics = emitPublicIcs(blocks);
    // Should contain Available summary
    expect(ics).toContain("Available (");
    // Should NOT contain any location or description fields
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
    expect(ics).not.toContain("ATTENDEE:");
    expect(ics).not.toContain("ORGANIZER:");
  });
});

describe("family ICS includes family events and notes", () => {
  it("family ICS contains family event title", () => {
    const calEvents: CalEvent[] = [];
    const familyEvents: FamilyEvent[] = [
      makeFamilyEvent(1, "Family Dinner", "2026-06-01T08:00:00Z", "2026-06-01T10:00:00Z"),
    ];
    const ics = emitFamilyIcs(calEvents, familyEvents, [], []);
    expect(ics).toContain("Family Dinner");
  });

  it("family ICS contains day note as all-day event", () => {
    const ics = emitFamilyIcs(
      [],
      [],
      [{ date_local: "2026-06-01", body: "Kids have sports day" }],
      [],
    );
    expect(ics).toContain("SUMMARY:Family note");
    expect(ics).toContain("Kids have sports day");
    expect(ics).toContain("buoy-family-day-2026-06-01@buoy");
  });

  it("family ICS contains week note as Monday all-day event", () => {
    const ics = emitFamilyIcs(
      [],
      [],
      [],
      [{ iso_week: "2026-W23", body: "Big week note" }],
    );
    expect(ics).toContain("SUMMARY:Family note (week)");
    expect(ics).toContain("Big week note");
    expect(ics).toContain("buoy-family-week-2026-W23@buoy");
  });
});
