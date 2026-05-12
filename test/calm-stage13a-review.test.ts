// Stage 13a (2026-05-12) — Calm weekly-review aggregates.
//
// Pure-function test of computeCalmReviewAggregates with synthetic
// CoachSession fixtures. Verifies chip-frequency breakdown, top-3 mind
// categories, per-session deltas (only changed dimensions surface), and
// graceful handling of pre-13a sessions (chip columns all null).

import { describe, expect, it } from "vitest";
import type { CoachSession } from "@shared/schema";
import { computeCalmReviewAggregates } from "../server/calm-review";

// Builder for a synthetic completed Calm session. Defaults are the
// "old Stage-13" shape (all new chip columns null). Test cases override
// the specific columns they care about.
function makeSession(overrides: Partial<CoachSession>): CoachSession {
  const base: CoachSession = {
    id: 0,
    startedAt: Date.now(),
    endedAt: Date.now(),
    mode: "calm",
    contextSnapshot: "{}",
    summary: null,
    summaryEditedByUser: 0,
    linkedIssueId: null,
    linkedYmd: "2026-05-12",
    modelProvider: "perplexity",
    modelName: "sonar-pro",
    totalInputTokens: 0,
    totalOutputTokens: 0,
    deepThink: 0,
    archivedAt: null,
    calmVariant: "grounding_only",
    issueEntityType: null,
    issueEntityId: null,
    issueFreetext: null,
    preTags: null,
    preIntensity: null,
    groundingObservations: null,
    reframeText: null,
    reflectionWorstStory: null,
    reflectionAccurateStory: null,
    reflectionNextAction: null,
    postTags: null,
    postIntensity: null,
    postNote: null,
    completedAt: Date.now(),
    calmPreArousal: null,
    calmPreEnergy: null,
    calmPreSleep: null,
    calmPreMood: null,
    calmPreCognitiveLoad: null,
    calmPreFocus: null,
    calmPreAlignmentPeople: null,
    calmPreAlignmentValues: null,
    calmPreMindCategories: null,
    calmPreMindOtherLabel: null,
    calmPreBrainDump: null,
    calmPostArousal: null,
    calmPostEnergy: null,
    calmPostSleep: null,
    calmPostMood: null,
    calmPostCognitiveLoad: null,
    calmPostFocus: null,
    calmPostAlignmentPeople: null,
    calmPostAlignmentValues: null,
    calmPostMindCategories: null,
    calmPostMindOtherLabel: null,
    calmPostBrainDump: null,
  };
  return { ...base, ...overrides };
}

describe("computeCalmReviewAggregates", () => {
  it("counts pre-capture chip values per dimension", () => {
    const sessions: CoachSession[] = [
      makeSession({ id: 1, calmPreMood: "positive", calmPreEnergy: "high" }),
      makeSession({ id: 2, calmPreMood: "neutral", calmPreEnergy: "moderate" }),
      makeSession({ id: 3, calmPreMood: "neutral" }),
      makeSession({ id: 4, calmPreMood: "strained" }),
    ];
    const agg = computeCalmReviewAggregates(sessions);
    expect(agg.totalCount).toBe(4);
    const moodGroup = agg.chipFrequencies.find((g) => g.key === "mood")!;
    expect(moodGroup.counts).toEqual([
      { value: "neutral", count: 2 },
      { value: "positive", count: 1 },
      { value: "strained", count: 1 },
    ]);
    const energyGroup = agg.chipFrequencies.find((g) => g.key === "energy")!;
    // High + moderate each once; two sessions left blank — those don't count.
    expect(energyGroup.counts).toContainEqual({ value: "high", count: 1 });
    expect(energyGroup.counts).toContainEqual({ value: "moderate", count: 1 });
    expect(energyGroup.counts).toHaveLength(2);
  });

  it("returns top 3 mind categories sorted by count", () => {
    const sessions = [
      makeSession({
        id: 1,
        calmPreMindCategories: JSON.stringify(["Relationship", "Kids"]),
      }),
      makeSession({
        id: 2,
        calmPreMindCategories: JSON.stringify(["Kids", "House"]),
      }),
      makeSession({
        id: 3,
        calmPreMindCategories: JSON.stringify(["Work", "Kids"]),
      }),
      makeSession({
        id: 4,
        calmPreMindCategories: JSON.stringify(["Work", "House"]),
      }),
    ];
    const agg = computeCalmReviewAggregates(sessions);
    expect(agg.topMindCategories).toEqual([
      { category: "Kids", count: 3 },
      { category: "House", count: 2 },
      { category: "Work", count: 2 },
    ]);
  });

  it("per-session deltas only include dimensions that actually changed", () => {
    const sessions = [
      makeSession({
        id: 10,
        calmPreArousal: "hyper",
        calmPostArousal: "calm",
        calmPreMood: "strained",
        calmPostMood: "strained", // unchanged → not emitted
        calmPreEnergy: "low",
        calmPostEnergy: "moderate",
      }),
    ];
    const agg = computeCalmReviewAggregates(sessions);
    expect(agg.perSessionDeltas).toHaveLength(1);
    const d = agg.perSessionDeltas[0];
    expect(d.dimensionChanges.map((c) => c.label).sort()).toEqual([
      "Arousal",
      "Energy",
    ]);
    expect(d.dimensionChanges.find((c) => c.label === "Arousal")).toMatchObject({
      from: "hyper",
      to: "calm",
    });
  });

  it("emits an empty delta when pre and post chips match exactly", () => {
    const sessions = [
      makeSession({
        id: 11,
        calmPreArousal: "calm",
        calmPostArousal: "calm",
        calmPreMindCategories: JSON.stringify(["Work"]),
        calmPostMindCategories: JSON.stringify(["Work"]),
      }),
    ];
    const agg = computeCalmReviewAggregates(sessions);
    const d = agg.perSessionDeltas[0];
    expect(d.dimensionChanges).toEqual([]);
    expect(d.mindAdded).toEqual([]);
    expect(d.mindDropped).toEqual([]);
  });

  it("tracks added and dropped mind categories", () => {
    const sessions = [
      makeSession({
        id: 12,
        calmPreMindCategories: JSON.stringify(["Kids", "Work"]),
        calmPostMindCategories: JSON.stringify(["Kids", "House"]),
      }),
    ];
    const agg = computeCalmReviewAggregates(sessions);
    const d = agg.perSessionDeltas[0];
    expect(d.mindAdded).toEqual(["House"]);
    expect(d.mindDropped).toEqual(["Work"]);
  });

  it("treats a pre-13a session (all chip columns null) gracefully", () => {
    const sessions = [
      makeSession({
        id: 99,
        // Old Stage-13 row: no chips, just legacy intensity fields.
        preIntensity: 6,
        postIntensity: 3,
      }),
    ];
    const agg = computeCalmReviewAggregates(sessions);
    expect(agg.totalCount).toBe(1);
    // No chip counts.
    for (const group of agg.chipFrequencies) {
      expect(group.counts).toEqual([]);
    }
    expect(agg.topMindCategories).toEqual([]);
    expect(agg.perSessionDeltas[0].dimensionChanges).toEqual([]);
    expect(agg.perSessionDeltas[0].mindAdded).toEqual([]);
    expect(agg.perSessionDeltas[0].mindDropped).toEqual([]);
  });

  it("excludes sessions that have not been completed", () => {
    const sessions = [
      makeSession({ id: 20, completedAt: null, calmPreMood: "positive" }),
      makeSession({ id: 21, calmPreMood: "neutral" }),
    ];
    const agg = computeCalmReviewAggregates(sessions);
    expect(agg.totalCount).toBe(1);
    const moodGroup = agg.chipFrequencies.find((g) => g.key === "mood")!;
    expect(moodGroup.counts).toEqual([{ value: "neutral", count: 1 }]);
  });

  it("ignores malformed mind_categories JSON without throwing", () => {
    const sessions = [
      makeSession({
        id: 30,
        calmPreMindCategories: "not valid JSON",
        calmPostMindCategories: '"not an array"',
      }),
    ];
    const agg = computeCalmReviewAggregates(sessions);
    expect(agg.topMindCategories).toEqual([]);
    expect(agg.perSessionDeltas[0].mindAdded).toEqual([]);
    expect(agg.perSessionDeltas[0].mindDropped).toEqual([]);
  });
});
