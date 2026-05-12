// Stage 16 (2026-05-12) — Scheduling availability search.
//
// searchSlots(parsed, events) searches free time in the 07:00–21:00
// Australia/Melbourne window constrained by the parsed dateConstraints and
// timePreferences, avoiding busy blocks from the supplied events.
//
// Returns 3–5 ranked candidates. Ranking (deterministic, explainable):
//   1. Slots that satisfy dateConstraints + partOfDay preferences first
//   2. Least fragmentation of remaining free time in the day
//   3. Avoidance of very early (07:00–08:00) or very late (20:00–21:00) starts
//   4. Adjacency to same-location events when location metadata is present
//
// No LLM is involved in this module.

import type { CalEvent } from "./ics";
import type { ParsedScheduling, DateConstraint, PartOfDay } from "./scheduling-parser";

// ---- Constants --------------------------------------------------------------

const MELBOURNE_TZ = "Australia/Melbourne";
const WINDOW_START_H = 7;   // 07:00
const WINDOW_END_H = 21;    // 21:00
const MAX_CANDIDATES = 5;
const MIN_CANDIDATES = 3;

// ---- Types ------------------------------------------------------------------

export interface CandidateSlot {
  start: string;        // ISO 8601 — start of protected block (includes travelBefore)
  end: string;          // ISO 8601 — end of protected block (includes travelAfter)
  meetingStart: string; // ISO 8601 — actual meeting start
  meetingEnd: string;   // ISO 8601 — actual meeting end
  locationType: string;
  locationLabel: string | null;
  travelApplied: boolean;
  reasonSummary: string;
}

export interface SearchResult {
  candidates: CandidateSlot[];
}

// ---- Melbourne time helpers -------------------------------------------------

function melbNow(): Date {
  return new Date();
}

/** Return year, month (1-based), day in Melbourne local time for a Date. */
function melbDate(d: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: MELBOURNE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value ?? "0");
  const mo = Number(parts.find((p) => p.type === "month")?.value ?? "0");
  const da = Number(parts.find((p) => p.type === "day")?.value ?? "0");
  return { year: y, month: mo, day: da };
}

/** Build a Date at HH:MM Melbourne local time on the given local-date tuple. */
function melbDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  // Use Intl to find the UTC offset for this moment in Melbourne.
  // Construct an ISO string that Intl will parse as Melbourne local, then
  // compute the UTC equivalent.
  const localStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  // Trick: use a probe Date to find the offset, then apply it.
  // A simpler approach: use the TZ offset formula with Date.UTC.
  const probe = new Date(`${localStr}+00:00`);
  const localInProbe = new Intl.DateTimeFormat("en-CA", {
    timeZone: MELBOURNE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(probe);
  // localInProbe is "YYYY-MM-DD, HH:MM" in Melbourne TZ.
  // The offset is how far our UTC probe drifted from the desired local time.
  const probeLocal = parseMelbDateTimeString(localInProbe);
  const offsetMs = probe.getTime() - probeLocal.getTime();
  // offsetMs is negative when Melbourne is ahead of UTC (e.g. AEST = UTC+10).
  // Adding it converts the probe (treated-as-UTC) back to the actual UTC time.
  return new Date(probe.getTime() + offsetMs);
}

function parseMelbDateTimeString(s: string): Date {
  // "en-CA" format: "YYYY-MM-DD, HH:MM" (24h)
  const cleaned = s.replace(",", "").replace(/\s+/g, " ").trim();
  const [datePart, timePart] = cleaned.split(" ");
  const [year, month, day] = (datePart ?? "").split("-").map(Number);
  const [hour, minute] = (timePart ?? "").split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

/** Day-of-week (0=Sun, 1=Mon, ..., 6=Sat) in Melbourne local time. */
function melbDow(d: Date): number {
  const name = new Intl.DateTimeFormat("en-AU", {
    timeZone: MELBOURNE_TZ,
    weekday: "long",
  }).format(d);
  const MAP: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };
  return MAP[name] ?? 0;
}

/** Melbourne hour (0–23) for a Date. */
function melbHour(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: MELBOURNE_TZ,
      hour: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .find((p) => p.type === "hour")?.value ?? "0",
  );
}

const DAY_NAME_TO_DOW: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

// ---- Candidate date generation ----------------------------------------------

/** Generate up to `horizonDays` candidate dates matching the constraints. */
function candidateDates(
  constraints: DateConstraint[],
  horizonDays: number = 21,
): Date[] {
  const now = melbNow();
  // Start from tomorrow to avoid search returning slots already passed.
  const startOfTomorrow = new Date(now);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  startOfTomorrow.setHours(0, 0, 0, 0);

  const dates: Date[] = [];

  if (constraints.length === 0) return dates;

  for (let i = 0; i < horizonDays; i++) {
    const candidate = new Date(startOfTomorrow);
    candidate.setDate(startOfTomorrow.getDate() + i);

    for (const c of constraints) {
      if (c.type === "weekday") {
        const targetDow = DAY_NAME_TO_DOW[c.value.toLowerCase()];
        if (targetDow !== undefined && melbDow(candidate) === targetDow) {
          if (!dates.some((d) => melbDate(d).day === melbDate(candidate).day &&
            melbDate(d).month === melbDate(candidate).month &&
            melbDate(d).year === melbDate(candidate).year)) {
            dates.push(new Date(candidate));
          }
        }
      } else if (c.type === "relative") {
        const { year: ny, month: nm, day: nd } = melbDate(now);
        const todayMelb = melbDateTime(ny, nm, nd, 0, 0);
        let target: Date | null = null;
        if (c.value === "today") target = todayMelb;
        else if (c.value === "tomorrow") {
          target = new Date(todayMelb);
          target.setDate(target.getDate() + 1);
        } else if (c.value === "this_week" || c.value === "next_week") {
          // "this_week" / "next_week" — add all remaining days in that window.
          const dow = melbDow(candidate);
          const inThisWeek = i < 7 && c.value === "this_week";
          const inNextWeek = i >= 7 && i < 14 && c.value === "next_week";
          if ((inThisWeek || inNextWeek) && dow >= 1 && dow <= 5) {
            if (!dates.some((d) =>
              melbDate(d).year === melbDate(candidate).year &&
              melbDate(d).month === melbDate(candidate).month &&
              melbDate(d).day === melbDate(candidate).day)) {
              dates.push(new Date(candidate));
            }
          }
          continue;
        }
        if (target) {
          const td = melbDate(target);
          const cd = melbDate(candidate);
          if (td.year === cd.year && td.month === cd.month && td.day === cd.day) {
            if (!dates.some((d) => melbDate(d).year === cd.year && melbDate(d).month === cd.month && melbDate(d).day === cd.day)) {
              dates.push(new Date(candidate));
            }
          }
        }
      } else if (c.type === "exact") {
        // value = "YYYY-MM-DD"
        const [yr, mo, dy] = c.value.split("-").map(Number);
        const cd = melbDate(candidate);
        if (cd.year === yr && cd.month === mo && cd.day === dy) {
          if (!dates.some((d) => melbDate(d).year === yr && melbDate(d).month === mo && melbDate(d).day === dy)) {
            dates.push(new Date(candidate));
          }
        }
      }
    }
  }

  return dates.sort((a, b) => a.getTime() - b.getTime());
}

// ---- Part-of-day window -----------------------------------------------------

function partOfDayWindow(pod: PartOfDay): { startH: number; endH: number } {
  if (pod === "morning") return { startH: 7, endH: 12 };
  if (pod === "afternoon") return { startH: 12, endH: 17 };
  return { startH: 17, endH: 21 };
}

/** Return the effective time window for a date given constraints / preferences. */
function effectiveWindow(
  date: Date,
  constraints: DateConstraint[],
  timePrefs: ParsedScheduling["timePreferences"],
): { startH: number; endH: number } {
  const cd = melbDate(date);

  // Check if any constraint matches this date and carries a partOfDay.
  const dow = melbDow(date);
  const dowName = Object.entries(DAY_NAME_TO_DOW).find(([, v]) => v === dow)?.[0] ?? "";

  for (const c of constraints) {
    let matches = false;
    if (c.type === "weekday" && c.value.toLowerCase() === dowName) matches = true;
    if (c.type === "relative" && c.value === "today") {
      const now = melbNow();
      const nd = melbDate(now);
      matches = nd.year === cd.year && nd.month === cd.month && nd.day === cd.day;
    }
    if (c.type === "relative" && c.value === "tomorrow") {
      const tomorrow = new Date(melbNow());
      tomorrow.setDate(tomorrow.getDate() + 1);
      const td = melbDate(tomorrow);
      matches = td.year === cd.year && td.month === cd.month && td.day === cd.day;
    }
    if (c.type === "exact") {
      const [yr, mo, dy] = c.value.split("-").map(Number);
      matches = cd.year === yr && cd.month === mo && cd.day === dy;
    }
    if (matches && c.partOfDay) {
      return partOfDayWindow(c.partOfDay);
    }
  }

  // Fall back to timePreferences.
  if (timePrefs && timePrefs.length > 0) {
    return partOfDayWindow(timePrefs[0].partOfDay);
  }

  return { startH: WINDOW_START_H, endH: WINDOW_END_H };
}

// ---- Busy interval extraction -----------------------------------------------

interface Interval {
  start: Date;
  end: Date;
  location?: string;
}

/** Convert CalEvents to [start, end] UTC Dates. Ignore all-day events. */
function eventsToIntervals(events: CalEvent[]): Interval[] {
  return events
    .filter((e) => !e.allDay)
    .map((e) => ({
      start: new Date(e.start),
      end: new Date(e.end),
      location: e.location,
    }))
    .filter((iv) => iv.end > iv.start);
}

/** Merge overlapping / adjacent intervals (sorted by start). */
function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      if (sorted[i].end > last.end) last.end = sorted[i].end;
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}

// ---- Candidate slot generation for one day ----------------------------------

interface DayCandidate {
  start: Date;
  end: Date;
  meetingStart: Date;
  meetingEnd: Date;
  date: Date;
  constraint: DateConstraint | null;
  startHour: number;
  adjacentLocation: string | null;
  /** Minutes of free time left after this slot in the day window. */
  freeAfterMinutes: number;
  /** Whether start is in the very-early (07–08) or very-late (20–21) band. */
  awkwardStart: boolean;
}

function findSlotsForDay(
  date: Date,
  parsed: ParsedScheduling,
  busyIntervals: Interval[],
  constraints: DateConstraint[],
): DayCandidate[] {
  const { durationMinutes, travelMinutesBefore, travelMinutesAfter } = parsed;
  if (!durationMinutes || durationMinutes <= 0) return [];

  const totalBlock = durationMinutes + travelMinutesBefore + travelMinutesAfter;
  const { startH, endH } = effectiveWindow(date, constraints, parsed.timePreferences);

  const { year: dy, month: dm, day: dd } = melbDate(date);
  const windowStart = melbDateTime(dy, dm, dd, startH, 0);
  const windowEnd = melbDateTime(dy, dm, dd, endH, 0);

  // Filter busy intervals to those overlapping this day window.
  const dayBusy = mergeIntervals(
    busyIntervals.filter(
      (iv) => iv.end > windowStart && iv.start < windowEnd,
    ),
  );

  // Build free slots.
  const freeSlots: Array<{ s: Date; e: Date }> = [];
  let cursor = new Date(windowStart);
  for (const busy of dayBusy) {
    if (busy.start > cursor) {
      freeSlots.push({ s: new Date(cursor), e: new Date(busy.start) });
    }
    if (busy.end > cursor) cursor = new Date(busy.end);
  }
  if (cursor < windowEnd) {
    freeSlots.push({ s: new Date(cursor), e: new Date(windowEnd) });
  }

  // Find constraint matching this date (for ranking).
  const dow = melbDow(date);
  const dowName = Object.entries(DAY_NAME_TO_DOW).find(([, v]) => v === dow)?.[0] ?? "";
  const { year: cdy, month: cdm, day: cdd } = melbDate(date);
  const matchingConstraint =
    constraints.find(
      (c) =>
        (c.type === "weekday" && c.value.toLowerCase() === dowName) ||
        (c.type === "exact" &&
          (() => {
            const [yr, mo, dy] = c.value.split("-").map(Number);
            return cdy === yr && cdm === mo && cdd === dy;
          })()),
    ) ?? null;

  const candidates: DayCandidate[] = [];

  for (const free of freeSlots) {
    const gapMs = free.e.getTime() - free.s.getTime();
    const neededMs = totalBlock * 60 * 1000;
    if (gapMs < neededMs) continue;

    // Generate at most 2 positions per free gap: start and middle-aligned.
    const positions: Date[] = [];
    positions.push(new Date(free.s)); // Earliest in gap.
    // If gap is large enough, also try a slot that centres the meeting.
    const midStart = new Date(free.s.getTime() + (gapMs - neededMs) / 2);
    if (midStart.getTime() !== free.s.getTime()) {
      positions.push(midStart);
    }

    for (const slotStart of positions) {
      const slotEnd = new Date(slotStart.getTime() + totalBlock * 60 * 1000);
      const meetingStart = new Date(slotStart.getTime() + travelMinutesBefore * 60 * 1000);
      const meetingEnd = new Date(meetingStart.getTime() + durationMinutes * 60 * 1000);

      const startHour = melbHour(slotStart);
      const awkwardStart = startHour < 8 || startHour >= 20;

      // Minutes of window remaining after this slot.
      const freeAfterMs = windowEnd.getTime() - slotEnd.getTime();
      const freeAfterMinutes = Math.max(0, Math.floor(freeAfterMs / 60000));

      // Check adjacency to same-location event.
      let adjacentLocation: string | null = null;
      if (parsed.locationLabel) {
        const label = parsed.locationLabel.toLowerCase();
        for (const iv of busyIntervals) {
          if (!iv.location) continue;
          if (!iv.location.toLowerCase().includes(label)) continue;
          // Adjacent means within 60 min of the candidate slot.
          const gap1 = Math.abs(iv.end.getTime() - slotStart.getTime());
          const gap2 = Math.abs(slotEnd.getTime() - iv.start.getTime());
          if (gap1 <= 60 * 60 * 1000 || gap2 <= 60 * 60 * 1000) {
            adjacentLocation = iv.location;
            break;
          }
        }
      }

      candidates.push({
        start: slotStart,
        end: slotEnd,
        meetingStart,
        meetingEnd,
        date,
        constraint: matchingConstraint,
        startHour,
        adjacentLocation,
        freeAfterMinutes,
        awkwardStart,
      });
    }
  }

  return candidates;
}

// ---- Ranking ----------------------------------------------------------------

function scoreCandidate(c: DayCandidate): number {
  // Lower score = better rank.
  let s = 0;

  // Awkward start penalty.
  if (c.awkwardStart) s += 1000;

  // Prefer less fragmentation: penalise leaving tiny free gaps (< 30 min).
  if (c.freeAfterMinutes > 0 && c.freeAfterMinutes < 30) s += 500;

  // Reward adjacency to same-location events.
  if (c.adjacentLocation) s -= 200;

  // Prefer earlier in day (ties broken by start time).
  s += c.startHour * 10;

  return s;
}

// ---- Part-of-day label helper -----------------------------------------------

function podLabel(h: number): string {
  if (h >= 7 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  return "evening";
}

function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: MELBOURNE_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function fmtDay(d: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: MELBOURNE_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

function buildReasonSummary(c: DayCandidate, parsed: ParsedScheduling): string {
  const day = fmtDay(c.meetingStart);
  const startTime = fmtTime(c.meetingStart);
  const pod = podLabel(c.startHour);
  let reason = `Fits within ${day} ${pod} (${startTime})`;

  if (c.freeAfterMinutes >= 60) {
    reason += `; ${c.freeAfterMinutes} minutes free after`;
  } else if (c.freeAfterMinutes >= 30) {
    reason += `; ${c.freeAfterMinutes} minutes buffer after`;
  }

  if (parsed.travelMinutesBefore > 0 || parsed.travelMinutesAfter > 0) {
    reason += `; ${parsed.travelMinutesBefore} min travel before, ${parsed.travelMinutesAfter} min after`;
  }

  if (c.adjacentLocation) {
    reason += `; adjacent to ${c.adjacentLocation} event`;
  }

  return reason;
}

// ---- Public API -------------------------------------------------------------

export function searchSlots(
  parsed: ParsedScheduling,
  events: CalEvent[],
): SearchResult {
  const { dateConstraints } = parsed;

  if (dateConstraints.length === 0) {
    return { candidates: [] };
  }

  const busyIntervals = eventsToIntervals(events);
  const dates = candidateDates(dateConstraints, 28);

  const all: DayCandidate[] = [];
  for (const date of dates) {
    const dayCandidates = findSlotsForDay(date, parsed, busyIntervals, dateConstraints);
    all.push(...dayCandidates);
  }

  // Rank deterministically.
  all.sort((a, b) => {
    const sa = scoreCandidate(a);
    const sb = scoreCandidate(b);
    if (sa !== sb) return sa - sb;
    return a.start.getTime() - b.start.getTime();
  });

  // Deduplicate: keep at most one candidate per date (the best one).
  const seen = new Set<string>();
  const deduped = all.filter((c) => {
    const key = c.start.toISOString().slice(0, 10);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const top = deduped.slice(0, MAX_CANDIDATES);

  const candidates: CandidateSlot[] = top.map((c) => ({
    start: c.start.toISOString(),
    end: c.end.toISOString(),
    meetingStart: c.meetingStart.toISOString(),
    meetingEnd: c.meetingEnd.toISOString(),
    locationType: parsed.locationType,
    locationLabel: parsed.locationLabel,
    travelApplied: parsed.travelMinutesBefore > 0 || parsed.travelMinutesAfter > 0,
    reasonSummary: buildReasonSummary(c, parsed),
  }));

  return { candidates };
}
