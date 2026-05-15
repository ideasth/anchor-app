// Stage 19 (2026-05-16) — Per-sibling sliding-window rate limiter.
//
// In-process, no external deps. Each sibling ID gets two independent
// sliding windows (per-minute and per-hour). A noisy sibling cannot starve
// a quieter one — they share nothing.
//
// Window semantics: we record the monotonic timestamp of each successful
// request. On each check we drop any timestamps older than the window and
// compare the remaining count to the cap.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export const DEFAULT_PER_MINUTE = 60;
export const DEFAULT_PER_HOUR = 600;

interface SiblingWindows {
  minute: number[];
  hour: number[];
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds the caller must wait. 0 when `allowed === true`. */
  retryAfter: number;
  /** Which cap fired ("minute" or "hour"), or null if allowed. */
  reason: "minute" | "hour" | null;
}

export class ProxyRateLimiter {
  private readonly state = new Map<string, SiblingWindows>();
  constructor(
    private readonly perMinute: number = DEFAULT_PER_MINUTE,
    private readonly perHour: number = DEFAULT_PER_HOUR,
  ) {}

  /**
   * Check (and on `allowed === true`, record) one request from the given
   * sibling. Time source is injected for tests; production callers pass
   * `Date.now()`.
   */
  check(siblingId: string, now: number = Date.now()): RateLimitDecision {
    const win = this.windowsFor(siblingId);
    prune(win.minute, now - MINUTE_MS);
    prune(win.hour, now - HOUR_MS);

    if (win.minute.length >= this.perMinute) {
      // Caller must wait until the oldest minute-window entry rolls off.
      const oldest = win.minute[0];
      const retryAfter = Math.max(1, Math.ceil((oldest + MINUTE_MS - now) / 1000));
      return { allowed: false, retryAfter, reason: "minute" };
    }
    if (win.hour.length >= this.perHour) {
      const oldest = win.hour[0];
      const retryAfter = Math.max(1, Math.ceil((oldest + HOUR_MS - now) / 1000));
      return { allowed: false, retryAfter, reason: "hour" };
    }

    win.minute.push(now);
    win.hour.push(now);
    return { allowed: true, retryAfter: 0, reason: null };
  }

  /** Test helper — clear all counters. */
  reset(): void {
    this.state.clear();
  }

  private windowsFor(siblingId: string): SiblingWindows {
    let cur = this.state.get(siblingId);
    if (!cur) {
      cur = { minute: [], hour: [] };
      this.state.set(siblingId, cur);
    }
    return cur;
  }
}

/**
 * Drop entries older than `cutoff` from an ordered (ascending) array of
 * timestamps in place. Mutating shift is fine here — windows are bounded
 * by the cap (at most `perHour` entries, i.e. 600 by default).
 */
function prune(arr: number[], cutoff: number): void {
  while (arr.length > 0 && arr[0] < cutoff) {
    arr.shift();
  }
}

// Process-wide singleton used by the route module. Tests construct their
// own instances so they don't share state with the live limiter.
export const proxyRateLimiter = new ProxyRateLimiter();
