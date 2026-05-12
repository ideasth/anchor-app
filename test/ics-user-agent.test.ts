// Stage 14 phase 2 (2026-05-12) — verify the ICS fetcher sends a
// Buoy-branded, domain-neutral User-Agent. Previously the header was
// "Anchor/1.0 (oliver-daly)" which both leaked the author's name and
// kept the legacy app name; Path B copy guidance is domain-neutral
// branding.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCachedEvents } from "../server/ics";

describe("ICS fetch User-Agent", () => {
  let originalFetch: typeof globalThis.fetch;
  let lastInit: RequestInit | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    lastInit = undefined;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      lastInit = init;
      return new Response("BEGIN:VCALENDAR\nEND:VCALENDAR\n", {
        status: 200,
        headers: { "Content-Type": "text/calendar" },
      });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends User-Agent: Buoy/1.0 (no personal-name suffix)", async () => {
    // Force a cache miss with a unique URL per test run.
    const url = `https://example.invalid/${Date.now()}-${Math.random()}.ics`;
    await getCachedEvents(url, true);
    expect(lastInit).toBeDefined();
    const headers = (lastInit!.headers ?? {}) as Record<string, string>;
    expect(headers["User-Agent"]).toBe("Buoy/1.0");
    // The author's name MUST NOT appear anywhere in the header set.
    for (const v of Object.values(headers)) {
      expect(v.toLowerCase()).not.toContain("oliver");
      expect(v.toLowerCase()).not.toContain("daly");
    }
    // The legacy app-name token must not leak through either.
    expect(headers["User-Agent"]).not.toContain("Anchor");
  });
});
