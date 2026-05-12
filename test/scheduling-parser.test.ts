// Stage 16 (2026-05-12) — Scheduling parser tests.
//
// Mocks the LLM adapter so no network calls are made. Tests the
// generateParsed wrapper including validation and error handling.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { SchedulingParseError } from "../server/scheduling-parser";

// ---- Mock the perplexity adapter ----------------------------------------

const mockComplete = vi.fn();

vi.mock("../server/llm/perplexity", () => ({
  getPerplexityAdapter: () => ({
    complete: mockComplete,
  }),
}));

// Helper: make mockComplete return a given JSON string.
function mockLLM(json: unknown) {
  const text = typeof json === "string" ? json : JSON.stringify(json);
  mockComplete.mockResolvedValueOnce({ fullText: text, usage: {}, modelUsed: "sonar-pro" });
}

beforeEach(() => {
  mockComplete.mockReset();
});

describe("scheduling-parser — generateParsed", () => {
  it("parses an online weekday morning prompt", async () => {
    const { generateParsed } = await import("../server/scheduling-parser");
    mockLLM({
      activity: "meeting",
      durationMinutes: 60,
      locationType: "online",
      locationLabel: null,
      travelMinutesBefore: 0,
      travelMinutesAfter: 0,
      dateConstraints: [{ type: "weekday", value: "friday", partOfDay: "morning" }],
      timePreferences: null,
    });

    const result = await generateParsed("Find a 60-minute online meeting next Friday morning");
    expect(result.locationType).toBe("online");
    expect(result.durationMinutes).toBe(60);
    expect(result.travelMinutesBefore).toBe(0);
    expect(result.travelMinutesAfter).toBe(0);
    expect(result.dateConstraints).toHaveLength(1);
    expect(result.dateConstraints[0].value).toBe("friday");
    expect(result.dateConstraints[0].partOfDay).toBe("morning");
  });

  it("parses an in-person prompt with travel", async () => {
    const { generateParsed } = await import("../server/scheduling-parser");
    mockLLM({
      activity: "appointment",
      durationMinutes: 90,
      locationType: "in_person",
      locationLabel: "Carlton",
      travelMinutesBefore: 30,
      travelMinutesAfter: 30,
      dateConstraints: [
        { type: "weekday", value: "tuesday", partOfDay: "afternoon" },
        { type: "weekday", value: "thursday", partOfDay: "afternoon" },
      ],
      timePreferences: null,
    });

    const result = await generateParsed(
      "90-minute appointment in Carlton, Tuesday or Thursday afternoon, 30 min travel each way",
    );
    expect(result.locationType).toBe("in_person");
    expect(result.locationLabel).toBe("Carlton");
    expect(result.travelMinutesBefore).toBe(30);
    expect(result.travelMinutesAfter).toBe(30);
    expect(result.dateConstraints).toHaveLength(2);
  });

  it("parses an online meeting with zero travel (not explicitly requested)", async () => {
    const { generateParsed } = await import("../server/scheduling-parser");
    mockLLM({
      activity: "call",
      durationMinutes: 45,
      locationType: "online",
      locationLabel: "Zoom",
      travelMinutesBefore: 0,
      travelMinutesAfter: 0,
      dateConstraints: [{ type: "relative", value: "tomorrow", partOfDay: null }],
      timePreferences: [{ partOfDay: "afternoon" }],
    });

    const result = await generateParsed("Find time for a 45-minute Zoom call tomorrow");
    expect(result.locationType).toBe("online");
    expect(result.travelMinutesBefore).toBe(0);
    expect(result.travelMinutesAfter).toBe(0);
  });

  it("parses 'tomorrow afternoon' (AU idiom)", async () => {
    const { generateParsed } = await import("../server/scheduling-parser");
    mockLLM({
      activity: "meeting",
      durationMinutes: 30,
      locationType: "unspecified",
      locationLabel: null,
      travelMinutesBefore: 0,
      travelMinutesAfter: 0,
      dateConstraints: [{ type: "relative", value: "tomorrow", partOfDay: "afternoon" }],
      timePreferences: null,
    });

    const result = await generateParsed("30-minute meeting tomorrow afternoon");
    expect(result.dateConstraints[0].value).toBe("tomorrow");
    expect(result.dateConstraints[0].partOfDay).toBe("afternoon");
  });

  it("returns null durationMinutes when duration is missing", async () => {
    const { generateParsed } = await import("../server/scheduling-parser");
    mockLLM({
      activity: "catch-up",
      durationMinutes: null,
      locationType: "online",
      locationLabel: null,
      travelMinutesBefore: 0,
      travelMinutesAfter: 0,
      dateConstraints: [{ type: "weekday", value: "monday", partOfDay: null }],
      timePreferences: null,
    });

    const result = await generateParsed("Online catch-up Monday");
    expect(result.durationMinutes).toBeNull();
  });

  it("parses Australian idiom 'arvo' as afternoon", async () => {
    const { generateParsed } = await import("../server/scheduling-parser");
    mockLLM({
      activity: "appointment",
      durationMinutes: 60,
      locationType: "unspecified",
      locationLabel: null,
      travelMinutesBefore: 0,
      travelMinutesAfter: 0,
      dateConstraints: [{ type: "relative", value: "tomorrow", partOfDay: "afternoon" }],
      timePreferences: null,
    });

    const result = await generateParsed("60-minute appointment tomorrow arvo");
    expect(result.dateConstraints[0].partOfDay).toBe("afternoon");
  });

  it("throws SchedulingParseError when LLM returns malformed JSON", async () => {
    const { generateParsed } = await import("../server/scheduling-parser");
    mockComplete.mockResolvedValueOnce({
      fullText: "Sure! Here's the JSON: { broken",
      usage: {},
      modelUsed: "sonar-pro",
    });

    await expect(generateParsed("something")).rejects.toThrow(SchedulingParseError);
  });

  it("throws SchedulingParseError when LLM HTTP call fails", async () => {
    const { generateParsed } = await import("../server/scheduling-parser");
    mockComplete.mockRejectedValueOnce(new Error("Perplexity HTTP 503"));

    await expect(generateParsed("something")).rejects.toThrow(SchedulingParseError);
  });

  it("clamps activity string to 80 chars", async () => {
    const { generateParsed } = await import("../server/scheduling-parser");
    const longActivity = "a".repeat(200);
    mockLLM({
      activity: longActivity,
      durationMinutes: 60,
      locationType: "online",
      locationLabel: null,
      travelMinutesBefore: 0,
      travelMinutesAfter: 0,
      dateConstraints: [],
      timePreferences: null,
    });

    const result = await generateParsed("test");
    expect(result.activity.length).toBeLessThanOrEqual(80);
  });

  it("strips markdown fences from LLM output before parsing", async () => {
    const { generateParsed } = await import("../server/scheduling-parser");
    const json = {
      activity: "meeting",
      durationMinutes: 30,
      locationType: "online",
      locationLabel: null,
      travelMinutesBefore: 0,
      travelMinutesAfter: 0,
      dateConstraints: [],
      timePreferences: null,
    };
    mockComplete.mockResolvedValueOnce({
      fullText: "```json\n" + JSON.stringify(json) + "\n```",
      usage: {},
      modelUsed: "sonar-pro",
    });

    const result = await generateParsed("test");
    expect(result.durationMinutes).toBe(30);
  });
});
