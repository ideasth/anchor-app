// server/cron-heartbeat.ts
// Option 3 — single-cron canary heartbeat anomaly detector.
//
// Each known cron POSTs a heartbeat to /api/admin/cron-heartbeat as step 0 of
// its task body (best-effort; failure does NOT abort the cron). The handler
// classifies the heartbeat against an allowlist + per-cron expected-window
// schedule and either records a clean heartbeat or an anomaly.
//
// Anomalies are recorded in two places:
//   - cron_heartbeats.anomaly_reason (durable, shown in the Admin UI)
//   - the in-memory error ring (visible in the Recent errors card)
//
// We deliberately keep the detector isolated and pure — it takes the cron id,
// a timestamp, and an optional list of previous heartbeats — so it can be
// unit-tested without a SQLite fixture. The HTTP route in admin-db.ts is the
// only place that touches storage.
//
// Anomaly definitions (in priority order):
//   1. unknown_cron_id     — heartbeat with cronId not in the allowlist
//   2. off_window          — heartbeat outside the expected UTC window (>30 min jitter)
//   3. double_fire         — second heartbeat within 24 hours of a previous one
//
// Missed-fire detection is intentionally NOT implemented here — cron d08f13f1
// (the verify-receipt loop) already detects staleness via backup receipt age.
//
// The expected-window schedule is hand-curated from shared/cron-inventory.ts
// plus standing crons not in that retune list (236aa4a4 one-shot reminder,
// f04511c0 if active, etc). When a cron is retuned (e.g. AEDT cutover), this
// table must be updated. The cron-inventory drift test catches inventory
// changes; this table is not yet covered by a drift test.

import { AEDT_RETUNE_INVENTORY, parseHourField } from "../shared/cron-inventory";

export interface HeartbeatWindow {
  /** Cron expression in UTC (must use 5-field syntax with hour as comma list or single int). */
  utcCron: string;
  /** Half-window jitter, in minutes. A heartbeat is on-window if it lands within
   *  this many minutes of the schedule's nearest expected fire-time. Default 30. */
  jitterMinutes?: number;
  /** Optional: short human label for diagnostics. */
  label?: string;
}

/**
 * Allowlist of cron ids that are permitted to POST heartbeats, plus their
 * expected UTC schedule. Anything outside this map is an anomaly.
 *
 * Sourced primarily from AEDT_RETUNE_INVENTORY (so we automatically pick up
 * retunes — see CronInventoryEntry.currentCron). Add non-inventory crons here
 * by hand only if they also POST heartbeats.
 */
export function buildExpectedWindows(): Record<string, HeartbeatWindow> {
  const out: Record<string, HeartbeatWindow> = {};
  for (const e of AEDT_RETUNE_INVENTORY) {
    out[e.id] = {
      utcCron: e.currentCron,
      jitterMinutes: 30,
      label: e.label,
    };
  }
  return out;
}

export type AnomalyReason =
  | "unknown_cron_id"
  | "off_window"
  | "double_fire";

export interface ClassifyInput {
  cronId: string;
  /** Heartbeat timestamp in unix milliseconds (UTC). */
  ranAtMs: number;
  /** Previous heartbeats for THIS cron id within the last 24h, oldest first.
   *  An empty array means "no prior heartbeat in 24h" (clean). */
  recentHeartbeatsMs: number[];
  /** Allowlist override (defaults to buildExpectedWindows()). */
  windows?: Record<string, HeartbeatWindow>;
}

export interface ClassifyResult {
  anomaly: AnomalyReason | null;
  /** Human-readable detail for the admin UI / error ring. Empty when clean. */
  detail: string;
}

/**
 * Pure classifier — does NOT touch storage, does NOT log. Returns the anomaly
 * reason (or null for clean) plus a short human-readable detail string.
 */
export function classifyHeartbeat(input: ClassifyInput): ClassifyResult {
  const windows = input.windows ?? buildExpectedWindows();
  const win = windows[input.cronId];

  // 1. Unknown cron id.
  if (!win) {
    return {
      anomaly: "unknown_cron_id",
      detail: `Heartbeat from unknown cronId '${input.cronId}'. Either the cron was not added to the heartbeat allowlist, or someone is forging POSTs.`,
    };
  }

  // 2. Off-window check.
  const jitterMin = win.jitterMinutes ?? 30;
  const offWindow = isOffWindow(win.utcCron, input.ranAtMs, jitterMin);
  if (offWindow !== null) {
    return {
      anomaly: "off_window",
      detail: `Heartbeat for ${input.cronId} (${win.label ?? "no label"}) fired ${offWindow.deltaMinutes} min outside the expected window (UTC cron '${win.utcCron}', jitter +/-${jitterMin}m). Heartbeat ranAt=${new Date(input.ranAtMs).toISOString()}.`,
    };
  }

  // 3. Double-fire check.
  const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
  const recent = input.recentHeartbeatsMs.filter((t) => t < input.ranAtMs);
  if (recent.length > 0) {
    const last = recent[recent.length - 1];
    const gapMs = input.ranAtMs - last;
    if (gapMs < TWENTY_FOUR_H_MS) {
      return {
        anomaly: "double_fire",
        detail: `Double-fire for ${input.cronId}: previous heartbeat ${Math.round(gapMs / 60000)} min before this one (last=${new Date(last).toISOString()}, this=${new Date(input.ranAtMs).toISOString()}). Schedule expects >=24h gap.`,
      };
    }
  }

  return { anomaly: null, detail: "" };
}

/**
 * Returns null if the timestamp is on-window (within +/- jitterMinutes of any
 * scheduled fire-time on the same UTC date). Otherwise returns the closest
 * delta in minutes (signed, but we return abs in `deltaMinutes`).
 *
 * Only supports cron expressions whose hour field is a comma list or single
 * integer (which is all of AEDT_RETUNE_INVENTORY). Minute field can be a
 * single integer; ranges/steps in either field are not supported.
 *
 * Also checks the day-of-week field: if dow is a single integer or comma list,
 * the timestamp's UTC weekday must match. dow='*' matches any day.
 */
function isOffWindow(
  utcCron: string,
  ranAtMs: number,
  jitterMinutes: number,
): { deltaMinutes: number } | null {
  const fields = utcCron.trim().split(/\s+/);
  if (fields.length !== 5) {
    // Don't classify as off-window for malformed crons — that's a different bug.
    return null;
  }
  const [minField, , dom, , dowField] = fields;

  // Reject anything with ranges or steps — we only handle comma/single ints.
  if (!/^[0-9,]+$/.test(minField)) return null;
  const minute = Number(minField);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  // Day of month: only '*' is supported. The retune inventory only uses '*'.
  if (dom !== "*") return null;

  // Day of week: '*' or comma list of 0-6.
  let allowedDows: number[] | null = null;
  if (dowField !== "*") {
    if (!/^[0-9,]+$/.test(dowField)) return null;
    const parsed = dowField.split(",").map((s) => Number(s));
    if (parsed.some((n) => !Number.isInteger(n) || n < 0 || n > 6)) return null;
    allowedDows = parsed;
  }

  const hours = parseHourField(utcCron);

  const ts = new Date(ranAtMs);
  const utcDow = ts.getUTCDay(); // 0 = Sun
  if (allowedDows !== null && !allowedDows.includes(utcDow)) {
    // Wrong weekday entirely. Treat as a very large delta so off_window fires.
    // Pick the smallest possible delta as if the same day's hour was the target.
    return { deltaMinutes: 24 * 60 };
  }

  // For each expected hour today (UTC), compute the minute-distance to ranAt
  // and keep the minimum.
  let minDelta = Number.POSITIVE_INFINITY;
  for (const h of hours) {
    const expected = new Date(ranAtMs);
    expected.setUTCHours(h, minute, 0, 0);
    const delta = Math.abs(ranAtMs - expected.getTime()) / 60000;
    if (delta < minDelta) minDelta = delta;
  }

  if (minDelta <= jitterMinutes) return null;
  return { deltaMinutes: Math.round(minDelta) };
}

/**
 * Validate the body of a POST /api/admin/cron-heartbeat request. Returns the
 * parsed input or a string error.
 */
export function parseHeartbeatBody(
  raw: unknown,
  nowMs: number,
): { ok: true; cronId: string; ranAtMs: number } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const body = raw as Record<string, unknown>;

  // cronId: required, 4-32 chars, alphanumeric + dash/underscore.
  if (typeof body.cronId !== "string") {
    return { ok: false, error: "cronId required (string)" };
  }
  const cronId = body.cronId.trim();
  if (!/^[A-Za-z0-9_-]{4,32}$/.test(cronId)) {
    return { ok: false, error: "cronId must be 4-32 chars (alphanumeric, dash, underscore)" };
  }

  // ranAt: optional unix seconds. If absent, default to now. Reject anything
  // more than 1 day in the future or 7 days in the past.
  let ranAtMs = nowMs;
  if (body.ranAt !== undefined && body.ranAt !== null) {
    if (typeof body.ranAt !== "number" || !Number.isFinite(body.ranAt)) {
      return { ok: false, error: "ranAt must be a finite number (unix seconds)" };
    }
    // Heuristic: values < 10^12 are seconds, >= 10^12 are ms. Cron bodies use seconds.
    ranAtMs = body.ranAt < 1e12 ? body.ranAt * 1000 : body.ranAt;
    const ONE_DAY_MS = 24 * 3600 * 1000;
    const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
    if (ranAtMs > nowMs + ONE_DAY_MS) {
      return { ok: false, error: "ranAt is more than 1 day in the future" };
    }
    if (ranAtMs < nowMs - SEVEN_DAYS_MS) {
      return { ok: false, error: "ranAt is more than 7 days in the past" };
    }
  }

  return { ok: true, cronId, ranAtMs };
}
