// Stage 17 — family event busy flag tests.
// Verifies that count_as_busy_for_public=0 excludes from free/busy compute,
// and count_as_busy_for_public=1 includes.

import { describe, it, expect } from "vitest";
import { computeAvailability } from "../server/public-calendar";
import type { FamilyEvent } from "../server/family-storage";
import type { BookableWindow } from "../server/public-calendar";

const BOOKABLE: BookableWindow = {
  mon: ["07:00", "19:00"],
  tue: ["07:00", "19:00"],
  wed: ["07:00", "19:00"],
  thu: ["07:00", "19:00"],
  fri: ["07:00", "19:00"],
  sat: ["08:00", "13:00"],
  sun: null,
};

function makeFev(id: number, busy: number): FamilyEvent {
  return {
    id,
    user_id: null,
    title: "Test",
    // Full bookable Monday: 07:00-19:00 AEST = 21:00(prev day)-09:00 UTC
    start_utc: "2026-05-31T21:00:00Z",
    end_utc: "2026-06-01T09:00:00Z",
    all_day: 0,
    location: null,
    notes: null,
    added_by: "token",
    count_as_busy_for_public: busy,
    created_at: "2026-05-31T21:00:00Z",
    updated_at: "2026-05-31T21:00:00Z",
  };
}

describe("family event busy flag", () => {
  const now = new Date("2026-05-31T21:00:00Z").getTime(); // 07:00 AEST Mon

  it("count_as_busy=0 does NOT block public availability", () => {
    const result = computeAvailability({
      calEvents: [],
      familyEvents: [makeFev(1, 0)],
      blocks: [],
      bookableWindow: BOOKABLE,
      now,
      horizonMs: 24 * 60 * 60 * 1000,
    });
    // Full day should be available since not busy
    expect(result.length).toBeGreaterThan(0);
    const totalMinutes = result.reduce((s, b) => s + b.durationMin, 0);
    expect(totalMinutes).toBeGreaterThan(600); // most of Mon available
  });

  it("count_as_busy=1 blocks public availability", () => {
    const result = computeAvailability({
      calEvents: [],
      familyEvents: [makeFev(1, 1)],
      blocks: [],
      bookableWindow: BOOKABLE,
      now,
      horizonMs: 24 * 60 * 60 * 1000,
    });
    // After buffering the all-day event, no Available blocks on Monday
    expect(result.length).toBe(0);
  });
});
