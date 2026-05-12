// Stage 13a (2026-05-12) — Calm route payload shape + reframe prompt
// shape. Hermetic — re-implements the route's body-coercion helpers and
// imports the calm-prompts module (which does not open data.db).

import { describe, expect, it } from "vitest";
import {
  buildCalmReframeMessages,
  CALM_REFRAME_SYSTEM_PROMPT,
} from "../server/calm-prompts";

// Mirror of the route's chipStr / chipArr helpers from coach-routes.ts.
// Kept inline so this test doesn't need to import the express stack.
function chipStr(v: unknown, max = 80): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}
function chipArr(v: unknown, maxLen = 12, maxItem = 80): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const s = item.trim();
    if (!s) continue;
    out.push(s.slice(0, maxItem));
    if (out.length >= maxLen) break;
  }
  return out.length > 0 ? out : null;
}

describe("Stage 13a chip body coercion", () => {
  it("chipStr trims, caps length, and converts blanks to null", () => {
    expect(chipStr("   hypo  ")).toBe("hypo");
    expect(chipStr("")).toBeNull();
    expect(chipStr("   ")).toBeNull();
    expect(chipStr(42 as unknown)).toBeNull();
    expect(chipStr("x".repeat(200), 10)).toHaveLength(10);
  });

  it("chipArr filters non-strings and blanks, caps length and item width", () => {
    expect(chipArr(["Kids", "", "  ", "House"])).toEqual(["Kids", "House"]);
    expect(chipArr(["x".repeat(120)], 12, 50)).toEqual(["x".repeat(50)]);
    expect(chipArr([])).toBeNull();
    expect(chipArr("Kids" as unknown)).toBeNull();
    expect(chipArr([1, 2, 3] as unknown)).toBeNull();
  });

  it("accepts an all-optional pre-capture payload (every chip null)", () => {
    const body: Record<string, unknown> = {
      calm_variant: "grounding_only",
    };
    expect(chipStr(body.pre_arousal)).toBeNull();
    expect(chipArr(body.pre_mind_categories)).toBeNull();
    expect(chipStr(body.pre_brain_dump)).toBeNull();
  });

  it("coerces a full pre-capture payload end-to-end", () => {
    const body = {
      calm_variant: "grounding_plus_reflection",
      pre_arousal: "hyper",
      pre_energy: "low",
      pre_sleep: "poor",
      pre_mood: "strained",
      pre_cognitive_load: "high",
      pre_focus: "scattered",
      pre_alignment_people: "disconnected",
      pre_alignment_values: "misaligned",
      pre_mind_categories: ["Relationship", "Work", "Other"],
      pre_mind_other_label: "the bathroom reno blew the budget",
      pre_brain_dump: "rough morning, slept badly, kids upset",
    };
    expect(chipStr(body.pre_arousal)).toBe("hyper");
    expect(chipStr(body.pre_alignment_values)).toBe("misaligned");
    expect(chipArr(body.pre_mind_categories)).toEqual([
      "Relationship",
      "Work",
      "Other",
    ]);
    expect(chipStr(body.pre_mind_other_label, 120)).toContain("bathroom reno");
  });
});

describe("Stage 13a reframe prompt assembly", () => {
  it("system prompt carries the locked check-in prefix", () => {
    expect(CALM_REFRAME_SYSTEM_PROMPT).toMatch(/brief check-in/i);
    expect(CALM_REFRAME_SYSTEM_PROMPT).toMatch(/do not list them back/i);
    expect(CALM_REFRAME_SYSTEM_PROMPT).toMatch(/regulation/i);
  });

  it("emits only the chip lines the user actually picked", () => {
    const messages = buildCalmReframeMessages({
      issueLabel: "Submit Coleman report",
      groundingObservations: { see: "desk lamp", hear: "rain", feel: "tight jaw" },
      preArousal: "hyper",
      preMood: "strained",
      preBrainDump: "stuck on the deadline",
    });
    const user = messages[1].content;
    // Picked chips show up.
    expect(user).toMatch(/Arousal: hyper/);
    expect(user).toMatch(/Mood: strained/);
    expect(user).toContain("Brain dump: stuck on the deadline");
    // Unpicked chips are silently omitted, NOT rendered as "(blank)".
    expect(user).not.toMatch(/Energy:/);
    expect(user).not.toMatch(/Sleep:/);
    expect(user).not.toMatch(/Focus:/);
  });

  it("renders Other-with-label when Other is in the mind categories", () => {
    const messages = buildCalmReframeMessages({
      issueLabel: "(none)",
      groundingObservations: { see: "", hear: "", feel: "" },
      preMindCategories: ["Kids", "Other"],
      preMindOtherLabel: "the leak in the kitchen",
    });
    const user = messages[1].content;
    expect(user).toContain("On their mind:");
    expect(user).toContain("Kids");
    expect(user).toContain("Other (the leak in the kitchen)");
  });

  it("falls back to legacy preTags / preIntensity when no new chips supplied", () => {
    const messages = buildCalmReframeMessages({
      issueLabel: "Old session",
      groundingObservations: { see: "", hear: "", feel: "" },
      preTags: ["overwhelmed", "scattered"],
      preIntensity: 8,
    });
    const user = messages[1].content;
    expect(user).toMatch(/Feeling tags: overwhelmed, scattered/);
    expect(user).toMatch(/Intensity \(0-10\): 8/);
  });

  it("prefers new chips over legacy fields when both are supplied", () => {
    const messages = buildCalmReframeMessages({
      issueLabel: "Mixed session",
      groundingObservations: { see: "", hear: "", feel: "" },
      preArousal: "calm",
      preTags: ["overwhelmed"],
      preIntensity: 5,
    });
    const user = messages[1].content;
    expect(user).toMatch(/Arousal: calm/);
    expect(user).not.toMatch(/Feeling tags:/);
    expect(user).not.toMatch(/Intensity/);
  });

  it("includes issueNotes when present", () => {
    const messages = buildCalmReframeMessages({
      issueLabel: "Project ABC",
      issueNotes: "long-running, partner expects an update Friday",
      groundingObservations: { see: "", hear: "", feel: "" },
    });
    expect(messages[1].content).toContain("Issue notes:");
    expect(messages[1].content).toContain("partner expects an update Friday");
  });
});
