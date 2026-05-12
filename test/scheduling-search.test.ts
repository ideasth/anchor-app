// Stage 16 (2026-05-12) — Scheduling search tests.
//
// Tests searchSlots() determinism, ranking, travel padding, source filtering,
// and edge cases. No LLM or network calls.

import { describe, expect, it } from "vitest";
import { searchSlots } from "../server/scheduling-search";
import type { ParsedScheduling } from "../server/scheduling-parser";
import type { CalEvent } from "../server/ics";

// ---- Helpers ---------------------------------------------------------------

/**
 * Build a CalEvent that is busy on the given AEST date from startH to endH.
 * We use a fixed Melbourne offset of +10:00 (AEST) for deterministic tests.
 */
function busyEvent(
  uid: string,
  dateYYYYMMDD: string,
  startH: number,
  endH: number,
  location?: string,
): CalEvent {
  const [y, m, d] = dateYYYYMMDD.split("-").map(Number);
  function iso(h: number): string {
    const date = new Date(Date.UTC(y, m - 1, d, h - 10, 0, 0)); // offset -10 to get Melbourne time
    return date.toISOString();
  }
  return {
    uid,
    summary: uid,
    start: iso(startH),
    end: iso(endH),
    allDay: false,
    location,
  };
}

function baseParsed(overrides: Partial<ParsedScheduling> = {}): ParsedScheduling {
  return {
    activity: "meeting",
    durationMinutes: 60,
    locationType: "online",
    locationLabel: null,
    travelMinutesBefore: 0,
    travelMinutesAfter: 0,
    dateConstraints: [{ type: "weekday", value: "tuesday", partOfDay: "morning" }],
    timePreferences: null,
    ...overrides,
  };
}

// Next Tuesday's date in Melbourne — computed at test-run time.
function nextWeekday(targetDow: number): string {
  // 0=Sun, 1=Mon, ..., 6=Sat
  const now = new Date();
  // Use Melbourne offset +10 approximate.
  const melbNow = new Date(now.getTime() + 10 * 3600 * 1000);
  const dow = melbNow.getUTCDay();
  let daysAhead = targetDow - dow;
  if (daysAhead <= 0) daysAhead += 7;
  const target = new Date(melbNow);
  target.setUTCDate(target.getUTCDate() + daysAhead);
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, "0");
  const d = String(target.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---- Tests -----------------------------------------------------------------

describe("searchSlots — empty calendar", () => {
  it("returns candidates when calendar is empty and dates are specified", () => {
    const parsed = baseParsed();
    const result = searchSlots(parsed, []);
    // Empty calendar means the whole window is free — should find slots.
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.length).toBeLessThanOrEqual(5);
  });

  it("returns empty candidates when dateConstraints is empty", () => {
    const parsed = baseParsed({ dateConstraints: [] });
    const result = searchSlots(parsed, []);
    expect(result.candidates).toHaveLength(0);
  });
});

describe("searchSlots — dense calendar", () => {
  it("finds the single free 2h gap in a dense day", () => {
    const tue = nextWeekday(2); // Tuesday
    // Busy: 07:00–09:00, 11:00–21:00 — free gap 09:00–11:00
    const events: CalEvent[] = [
      busyEvent("a", tue, 7, 9),
      busyEvent("b", tue, 11, 21),
    ];
    const parsed = baseParsed({
      durationMinutes: 60,
      dateConstraints: [{ type: "weekday", value: "tuesday", partOfDay: "morning" }],
    });
    const result = searchSlots(parsed, events);
    expect(result.candidates.length).toBeGreaterThan(0);
    // First candidate meetingStart should be around 09:00 Melbourne time
    const firstStart = new Date(result.candidates[0].meetingStart);
    // Approx check: hour in Melbourne (+10) should be 9
    const melbH = (firstStart.getUTCHours() + 10) % 24;
    expect(melbH).toBe(9);
  });
});

describe("searchSlots — travel padding", () => {
  it("accounts for 30/30 travel in the protected block", () => {
    const tue = nextWeekday(2);
    // Free from 07:00–21:00 (no busy events)
    const parsed = baseParsed({
      durationMinutes: 60,
      locationType: "in_person",
      locationLabel: "Carlton",
      travelMinutesBefore: 30,
      travelMinutesAfter: 30,
      dateConstraints: [{ type: "weekday", value: "tuesday", partOfDay: "morning" }],
    });
    const result = searchSlots(parsed, []);
    expect(result.candidates.length).toBeGreaterThan(0);
    // The protected block should be 2h total (30 + 60 + 30 = 120 min).
    const c = result.candidates[0];
    const blockMs = new Date(c.end).getTime() - new Date(c.start).getTime();
    expect(blockMs).toBe(120 * 60 * 1000);
    // meetingStart should be 30 min after start
    const meetingOffsetMs = new Date(c.meetingStart).getTime() - new Date(c.start).getTime();
    expect(meetingOffsetMs).toBe(30 * 60 * 1000);
    expect(c.travelApplied).toBe(true);
  });

  it("does not apply travel for online meetings (zero travel)", () => {
    const parsed = baseParsed({
      durationMinutes: 60,
      locationType: "online",
      travelMinutesBefore: 0,
      travelMinutesAfter: 0,
      dateConstraints: [{ type: "weekday", value: "wednesday", partOfDay: "afternoon" }],
    });
    const result = searchSlots(parsed, []);
    expect(result.candidates.length).toBeGreaterThan(0);
    const c = result.candidates[0];
    expect(c.travelApplied).toBe(false);
    // Block = meeting duration only
    const blockMs = new Date(c.end).getTime() - new Date(c.start).getTime();
    expect(blockMs).toBe(60 * 60 * 1000);
  });
});

describe("searchSlots — ranking determinism", () => {
  it("returns the same candidates across three independent calls (same input)", () => {
    const parsed = baseParsed({
      dateConstraints: [
        { type: "weekday", value: "tuesday", partOfDay: "morning" },
        { type: "weekday", value: "thursday", partOfDay: "afternoon" },
      ],
    });
    const r1 = searchSlots(parsed, []);
    const r2 = searchSlots(parsed, []);
    const r3 = searchSlots(parsed, []);
    expect(r1.candidates.map((c) => c.meetingStart)).toEqual(
      r2.candidates.map((c) => c.meetingStart),
    );
    expect(r2.candidates.map((c) => c.meetingStart)).toEqual(
      r3.candidates.map((c) => c.meetingStart),
    );
  });
});

describe("searchSlots — source filtering via events passed", () => {
  it("blocks slots only on the specific busy day (outlook vs outlook+ics)", () => {
    // Use an exact date constraint so we can target one specific day.
    const tue = nextWeekday(2);

    // Without any busy events: should find a candidate on that Tuesday morning.
    const parsedExact = baseParsed({
      durationMinutes: 60,
      dateConstraints: [{ type: "exact", value: tue, partOfDay: "morning" }],
    });

    const resultOutlookOnly = searchSlots(parsedExact, []);
    expect(resultOutlookOnly.candidates.length).toBeGreaterThan(0);

    // Block the entire morning window on that exact Tuesday.
    const mariekeBusy: CalEvent[] = [busyEvent("marieke-1", tue, 7, 12)];
    const resultWithMarieke = searchSlots(parsedExact, mariekeBusy);

    // With the morning blocked on the only searched date, no candidates.
    expect(resultWithMarieke.candidates).toHaveLength(0);
  });

  it("returns fewer candidates when ICS source adds busy blocks", () => {
    // Use weekday constraint across multiple occurrences.
    // Without ICS: free calendar -> multiple Tuesdays with morning slots.
    const parsedWeekday = baseParsed({
      durationMinutes: 60,
      dateConstraints: [{ type: "weekday", value: "tuesday", partOfDay: "morning" }],
    });

    const resultOutlookOnly = searchSlots(parsedWeekday, []);

    // Block the first Tuesday's morning (exact date).
    const tue = nextWeekday(2);
    const icsBusy: CalEvent[] = [busyEvent("ics-1", tue, 7, 12)];
    const resultWithIcs = searchSlots(parsedWeekday, icsBusy);

    // With ICS: first Tuesday blocked, remaining are free.
    // Both should have candidates, but the first candidate's start should differ.
    expect(resultOutlookOnly.candidates.length).toBeGreaterThan(0);
    expect(resultWithIcs.candidates.length).toBeGreaterThan(0);
    // First candidate without ICS starts on the first Tuesday.
    // First candidate with ICS skips to next Tuesday.
    expect(resultOutlookOnly.candidates[0].meetingStart).not.toBe(
      resultWithIcs.candidates[0].meetingStart,
    );
  });
});

describe("searchSlots — reasonSummary field", () => {
  it("includes a non-empty reasonSummary on each candidate", () => {
    const result = searchSlots(baseParsed(), []);
    for (const c of result.candidates) {
      expect(c.reasonSummary.length).toBeGreaterThan(0);
    }
  });
});

describe("searchSlots — candidate count bounds", () => {
  it("returns at most 5 candidates", () => {
    const parsed = baseParsed({
      dateConstraints: [
        { type: "weekday", value: "monday", partOfDay: null },
        { type: "weekday", value: "tuesday", partOfDay: null },
        { type: "weekday", value: "wednesday", partOfDay: null },
        { type: "weekday", value: "thursday", partOfDay: null },
        { type: "weekday", value: "friday", partOfDay: null },
        { type: "weekday", value: "saturday", partOfDay: null },
        { type: "weekday", value: "sunday", partOfDay: null },
      ],
    });
    const result = searchSlots(parsed, []);
    expect(result.candidates.length).toBeLessThanOrEqual(5);
  });
});
