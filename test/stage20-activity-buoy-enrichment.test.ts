// Stage 20 (2026-05-17) — buoy-enrichment: non-existent refs render as fallback, never throw.

import { describe, it, expect } from "vitest";
import { enrichEntry } from "../server/activity/buoy-enrichment";
import type { ActivityEntry } from "../server/activity/service";

function makeEntry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 1,
    userId: null,
    entryDate: "2026-05-17",
    startUtc: null,
    endUtc: null,
    durationMinutes: null,
    title: "Test",
    contextSummary: null,
    notes: null,
    tagsJson: "[]",
    categoryId: 1,
    subcategoryId: null,
    sourceId: null,
    sourceLink: null,
    buoyTaskId: null,
    buoyRelationshipId: null,
    buoyEmailStatusId: null,
    status: "Open",
    billable: 0,
    createdAt: "2026-05-17T00:00:00",
    updatedAt: "2026-05-17T00:00:00",
    ...overrides,
  };
}

describe("Stage 20 — buoy-enrichment", () => {
  it("does not throw for null refs", () => {
    expect(() => enrichEntry(makeEntry())).not.toThrow();
  });

  it("returns null labels when refs are null", () => {
    const enriched = enrichEntry(makeEntry());
    expect(enriched.taskLabel).toBeNull();
    expect(enriched.relationshipLabel).toBeNull();
    expect(enriched.emailStatusLabel).toBeNull();
  });

  it("returns fallback label for non-existent buoyTaskId", () => {
    const enriched = enrichEntry(makeEntry({ buoyTaskId: "99999999" }));
    expect(enriched.taskLabel).toContain("99999999");
    expect(enriched.taskLabel).not.toBeNull();
  });

  it("returns fallback label for non-existent buoyRelationshipId", () => {
    const enriched = enrichEntry(makeEntry({ buoyRelationshipId: "88888888" }));
    expect(enriched.relationshipLabel).toContain("88888888");
  });

  it("returns fallback label for non-existent buoyEmailStatusId", () => {
    const enriched = enrichEntry(makeEntry({ buoyEmailStatusId: "77777777" }));
    expect(enriched.emailStatusLabel).toContain("77777777");
  });

  it("enriched entry includes all original entry fields", () => {
    const entry = makeEntry({ title: "Original title", status: "Complete" });
    const enriched = enrichEntry(entry);
    expect(enriched.title).toBe("Original title");
    expect(enriched.status).toBe("Complete");
    expect(enriched.id).toBe(1);
  });
});
