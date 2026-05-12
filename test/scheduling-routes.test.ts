// Stage 16 (2026-05-12) — Scheduling route handler tests.
//
// Pure hermetic tests over the handler in server/scheduling-handlers.ts.
// A mock LLM and empty event list are used — no HTTP server, no data.db.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleSchedulingSearch } from "../server/scheduling-handlers";
import type { ParsedScheduling } from "../server/scheduling-parser";

// ---- Mock LLM ---------------------------------------------------------------

const mockComplete = vi.fn();

vi.mock("../server/llm/perplexity", () => ({
  getPerplexityAdapter: () => ({
    complete: mockComplete,
  }),
}));

function mockLLM(json: unknown) {
  const text = typeof json === "string" ? json : JSON.stringify(json);
  mockComplete.mockResolvedValueOnce({ fullText: text, usage: {}, modelUsed: "sonar-pro" });
}

beforeEach(() => {
  mockComplete.mockReset();
});

// ---- Shared fixtures -------------------------------------------------------

function validParsed(): ParsedScheduling {
  return {
    activity: "meeting",
    durationMinutes: 60,
    locationType: "online",
    locationLabel: null,
    travelMinutesBefore: 0,
    travelMinutesAfter: 0,
    dateConstraints: [{ type: "weekday", value: "tuesday", partOfDay: "morning" }],
    timePreferences: null,
  };
}

// ---- Tests ------------------------------------------------------------------

describe("scheduling-handlers — handler exists", () => {
  it("is only exposed via requireUserOrOrchestrator (checked in route layer)", () => {
    // The handler itself does not perform auth — that is the route layer's job.
    expect(typeof handleSchedulingSearch).toBe("function");
  });
});

describe("scheduling-handlers — {prompt} path", () => {
  it("calls generateParsed and returns parsed + candidates", async () => {
    const p = validParsed();
    mockLLM(p);

    const result = await handleSchedulingSearch({
      body: { prompt: "Find a 60-minute online meeting next Tuesday morning", sources: ["outlook"] },
      events: [],
    });

    expect(result.status).toBe(200);
    const body = result.body as { needsClarification: boolean; parsed: ParsedScheduling; candidates: unknown[] };
    expect(body.needsClarification).toBe(false);
    expect(body.parsed.durationMinutes).toBe(60);
    expect(Array.isArray(body.candidates)).toBe(true);
  });
});

describe("scheduling-handlers — {parsed} path (skip LLM)", () => {
  it("skips the LLM and searches directly", async () => {
    const p = validParsed();

    const result = await handleSchedulingSearch({
      body: { parsed: p, sources: ["outlook"] },
      events: [],
    });

    expect(result.status).toBe(200);
    // No LLM call should have been made.
    expect(mockComplete).not.toHaveBeenCalled();

    const body = result.body as { needsClarification: boolean };
    expect(body.needsClarification).toBe(false);
  });
});

describe("scheduling-handlers — clarification: empty sources", () => {
  it("returns needsClarification with missing=['sources'] when sources=[]", async () => {
    const result = await handleSchedulingSearch({
      body: { prompt: "Find a time", sources: [] },
      events: [],
    });

    expect(result.status).toBe(200);
    const body = result.body as { needsClarification: boolean; missing: string[] };
    expect(body.needsClarification).toBe(true);
    expect(body.missing).toContain("sources");
  });

  it("returns needsClarification with missing=['sources'] when sources omitted", async () => {
    const result = await handleSchedulingSearch({
      body: { prompt: "Find a time" },
      events: [],
    });

    expect(result.status).toBe(200);
    const body = result.body as { needsClarification: boolean; missing: string[] };
    expect(body.needsClarification).toBe(true);
    expect(body.missing).toContain("sources");
  });
});

describe("scheduling-handlers — clarification: missing duration", () => {
  it("returns needsClarification with missing=['duration'] when durationMinutes=null", async () => {
    const p: ParsedScheduling = {
      ...validParsed(),
      durationMinutes: null,
    };
    mockLLM(p);

    const result = await handleSchedulingSearch({
      body: { prompt: "Find a meeting Tuesday morning", sources: ["outlook"] },
      events: [],
    });

    expect(result.status).toBe(200);
    const body = result.body as { needsClarification: boolean; missing: string[] };
    expect(body.needsClarification).toBe(true);
    expect(body.missing).toContain("duration");
  });
});

describe("scheduling-handlers — clarification: missing dates", () => {
  it("returns needsClarification with missing=['dates'] when dateConstraints=[]", async () => {
    const p: ParsedScheduling = {
      ...validParsed(),
      dateConstraints: [],
    };
    mockLLM(p);

    const result = await handleSchedulingSearch({
      body: { prompt: "Find a 60-minute meeting", sources: ["outlook"] },
      events: [],
    });

    expect(result.status).toBe(200);
    const body = result.body as { needsClarification: boolean; missing: string[] };
    expect(body.needsClarification).toBe(true);
    expect(body.missing).toContain("dates");
  });
});

describe("scheduling-handlers — clarification: partial parse preserves fields", () => {
  it("returns the partial parsed payload when clarification is needed", async () => {
    const partial: ParsedScheduling = {
      activity: "meeting",
      durationMinutes: null,
      locationType: "online",
      locationLabel: null,
      travelMinutesBefore: 0,
      travelMinutesAfter: 0,
      dateConstraints: [{ type: "weekday", value: "tuesday", partOfDay: null }],
      timePreferences: null,
    };
    mockLLM(partial);

    const result = await handleSchedulingSearch({
      body: { prompt: "Meeting Tuesday", sources: ["buoy"] },
      events: [],
    });

    const body = result.body as { parsed: Partial<ParsedScheduling> };
    expect(body.parsed?.dateConstraints?.[0]?.value).toBe("tuesday");
  });
});
