import { describe, it, expect } from "vitest";
import {
  classifyHeartbeat,
  parseHeartbeatBody,
  buildExpectedWindows,
} from "../server/cron-heartbeat";
import { AEDT_RETUNE_INVENTORY } from "../shared/cron-inventory";

// Anchor cron 8e8b7bb5: "0 17 * * 6" = Saturday 17:00 UTC.
// Pick a known Saturday to avoid timezone surprises.
// 2026-05-09 is a Saturday. 17:00 UTC = ms 1778706000000.
const SAT_2026_05_09_17_00_UTC_MS = Date.UTC(2026, 4, 9, 17, 0, 0); // month is 0-indexed
const SAT_2026_05_09_06_00_UTC_MS = Date.UTC(2026, 4, 9, 6, 0, 0);
const SUN_2026_05_10_17_00_UTC_MS = Date.UTC(2026, 4, 10, 17, 0, 0);

describe("buildExpectedWindows", () => {
  it("includes every cron from the AEDT inventory", () => {
    const w = buildExpectedWindows();
    for (const e of AEDT_RETUNE_INVENTORY) {
      expect(w[e.id], `missing ${e.id}`).toBeDefined();
      expect(w[e.id].utcCron).toBe(e.currentCron);
    }
  });

  it("uses the inventory currentCron, not aedtCron (we are pre-cutover)", () => {
    const w = buildExpectedWindows();
    expect(w["8e8b7bb5"].utcCron).toBe("0 17 * * 6");
  });
});

describe("classifyHeartbeat — clean", () => {
  it("returns null anomaly for a known cron firing on schedule", () => {
    const r = classifyHeartbeat({
      cronId: "8e8b7bb5",
      ranAtMs: SAT_2026_05_09_17_00_UTC_MS,
      recentHeartbeatsMs: [],
    });
    expect(r.anomaly).toBeNull();
    expect(r.detail).toBe("");
  });

  it("accepts heartbeat within +/- 30 min jitter window", () => {
    const oneMinLate = SAT_2026_05_09_17_00_UTC_MS + 25 * 60 * 1000;
    const r = classifyHeartbeat({
      cronId: "8e8b7bb5",
      ranAtMs: oneMinLate,
      recentHeartbeatsMs: [],
    });
    expect(r.anomaly).toBeNull();
  });

  it("accepts a multi-hour cron firing at any of its expected hours", () => {
    // 0697627f = "0 20 * * *" daily 20:00 UTC.
    // Pick a Tuesday at 20:00 UTC.
    const tue20 = Date.UTC(2026, 4, 12, 20, 0, 0);
    const r = classifyHeartbeat({
      cronId: "0697627f",
      ranAtMs: tue20,
      recentHeartbeatsMs: [],
    });
    expect(r.anomaly).toBeNull();
  });

  it("accepts a comma-list cron firing at the second listed hour", () => {
    // 2928f9fa = "0 8,20 * * *" — 08:00 UTC and 20:00 UTC daily.
    const tue08 = Date.UTC(2026, 4, 12, 8, 0, 0);
    const tue20 = Date.UTC(2026, 4, 12, 20, 0, 0);
    expect(
      classifyHeartbeat({ cronId: "2928f9fa", ranAtMs: tue08, recentHeartbeatsMs: [] }).anomaly,
    ).toBeNull();
    expect(
      classifyHeartbeat({ cronId: "2928f9fa", ranAtMs: tue20, recentHeartbeatsMs: [] }).anomaly,
    ).toBeNull();
  });
});

describe("classifyHeartbeat — unknown_cron_id", () => {
  it("flags an unknown cronId", () => {
    const r = classifyHeartbeat({
      cronId: "deadbeef",
      ranAtMs: SAT_2026_05_09_17_00_UTC_MS,
      recentHeartbeatsMs: [],
    });
    expect(r.anomaly).toBe("unknown_cron_id");
    expect(r.detail).toContain("deadbeef");
  });
});

describe("classifyHeartbeat — off_window", () => {
  it("flags a heartbeat for the right cron but at the wrong hour", () => {
    const r = classifyHeartbeat({
      cronId: "8e8b7bb5",
      ranAtMs: SAT_2026_05_09_06_00_UTC_MS,
      recentHeartbeatsMs: [],
    });
    expect(r.anomaly).toBe("off_window");
    expect(r.detail).toContain("8e8b7bb5");
  });

  it("flags a Saturday-only cron firing on a Sunday at the right hour", () => {
    const r = classifyHeartbeat({
      cronId: "8e8b7bb5",
      ranAtMs: SUN_2026_05_10_17_00_UTC_MS,
      recentHeartbeatsMs: [],
    });
    expect(r.anomaly).toBe("off_window");
  });

  it("flags a heartbeat just outside the 30-min jitter window", () => {
    const r = classifyHeartbeat({
      cronId: "8e8b7bb5",
      ranAtMs: SAT_2026_05_09_17_00_UTC_MS + 31 * 60 * 1000,
      recentHeartbeatsMs: [],
    });
    expect(r.anomaly).toBe("off_window");
  });
});

describe("classifyHeartbeat — double_fire", () => {
  it("flags a second heartbeat within 24h of the first", () => {
    const earlier = SAT_2026_05_09_17_00_UTC_MS;
    const later = earlier + 5 * 60 * 60 * 1000; // 5h later, still on Saturday
    // Force "later" to be on-window: use an off-window time that is recent;
    // easier — make `later` the same as `earlier`+1h (still off-window, but
    // we'd then trip off_window first). Use the same hour next Saturday for
    // a clean double-fire-only test.
    const r = classifyHeartbeat({
      cronId: "8e8b7bb5",
      ranAtMs: earlier,
      recentHeartbeatsMs: [earlier - 12 * 60 * 60 * 1000], // 12h earlier
    });
    expect(r.anomaly).toBe("double_fire");
    void later;
  });

  it("does NOT flag a heartbeat exactly 7 days later (clean weekly cron)", () => {
    const oneWeekLater = SAT_2026_05_09_17_00_UTC_MS + 7 * 24 * 60 * 60 * 1000;
    const r = classifyHeartbeat({
      cronId: "8e8b7bb5",
      ranAtMs: oneWeekLater,
      recentHeartbeatsMs: [SAT_2026_05_09_17_00_UTC_MS],
    });
    expect(r.anomaly).toBeNull();
  });

  it("priorities: unknown_cron_id wins over off_window and double_fire", () => {
    const r = classifyHeartbeat({
      cronId: "ghostfire",
      ranAtMs: SAT_2026_05_09_06_00_UTC_MS,
      recentHeartbeatsMs: [SAT_2026_05_09_06_00_UTC_MS - 1000],
    });
    expect(r.anomaly).toBe("unknown_cron_id");
  });

  it("priorities: off_window wins over double_fire", () => {
    const r = classifyHeartbeat({
      cronId: "8e8b7bb5",
      ranAtMs: SAT_2026_05_09_06_00_UTC_MS,
      recentHeartbeatsMs: [SAT_2026_05_09_06_00_UTC_MS - 60 * 60 * 1000],
    });
    expect(r.anomaly).toBe("off_window");
  });
});

describe("parseHeartbeatBody", () => {
  const NOW = Date.UTC(2026, 4, 9, 12, 0, 0);

  it("rejects non-objects", () => {
    expect(parseHeartbeatBody(null, NOW).ok).toBe(false);
    expect(parseHeartbeatBody("string", NOW).ok).toBe(false);
    expect(parseHeartbeatBody(42, NOW).ok).toBe(false);
  });

  it("rejects missing or malformed cronId", () => {
    expect(parseHeartbeatBody({}, NOW).ok).toBe(false);
    expect(parseHeartbeatBody({ cronId: "" }, NOW).ok).toBe(false);
    expect(parseHeartbeatBody({ cronId: "abc" }, NOW).ok).toBe(false); // too short
    expect(parseHeartbeatBody({ cronId: "x".repeat(40) }, NOW).ok).toBe(false); // too long
    expect(parseHeartbeatBody({ cronId: "bad spaces" }, NOW).ok).toBe(false);
  });

  it("accepts a clean cronId without ranAt and defaults to now", () => {
    const r = parseHeartbeatBody({ cronId: "8e8b7bb5" }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cronId).toBe("8e8b7bb5");
      expect(r.ranAtMs).toBe(NOW);
    }
  });

  it("converts ranAt unix-seconds to ms", () => {
    const r = parseHeartbeatBody({ cronId: "8e8b7bb5", ranAt: NOW / 1000 }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ranAtMs).toBe(NOW);
  });

  it("accepts ranAt already in ms (>= 10^12)", () => {
    const r = parseHeartbeatBody({ cronId: "8e8b7bb5", ranAt: NOW }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ranAtMs).toBe(NOW);
  });

  it("rejects ranAt more than 1 day in the future", () => {
    const future = NOW / 1000 + 2 * 24 * 3600;
    const r = parseHeartbeatBody({ cronId: "8e8b7bb5", ranAt: future }, NOW);
    expect(r.ok).toBe(false);
  });

  it("rejects ranAt more than 7 days in the past", () => {
    const past = NOW / 1000 - 8 * 24 * 3600;
    const r = parseHeartbeatBody({ cronId: "8e8b7bb5", ranAt: past }, NOW);
    expect(r.ok).toBe(false);
  });

  it("rejects non-finite ranAt", () => {
    expect(parseHeartbeatBody({ cronId: "8e8b7bb5", ranAt: NaN }, NOW).ok).toBe(false);
    expect(parseHeartbeatBody({ cronId: "8e8b7bb5", ranAt: Infinity }, NOW).ok).toBe(false);
    expect(parseHeartbeatBody({ cronId: "8e8b7bb5", ranAt: "12345" }, NOW).ok).toBe(false);
  });
});
