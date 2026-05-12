// Stage 14 (2026-05-12) — Reflect-mode prompt injection from the
// relationships slice in the context bundle.
//
// Pulls renderReflectInstructions in isolation so the test stays
// hermetic (no storage.ts import → no data.db open). Verifies the
// section is added when names are present, omitted when empty, and
// neither contains the old hard-coded names.

import { describe, expect, it } from "vitest";
import { renderReflectInstructions } from "../server/reflect-prompt";

describe("renderReflectInstructions", () => {
  it("omits the people section entirely when the relationships array is empty", () => {
    const text = renderReflectInstructions([]);
    expect(text).toContain("REFLECT mode");
    expect(text).not.toContain("Important people");
    // The previous hard-coded names must not leak back in via the
    // base instructions.
    expect(text).not.toContain("Marieke");
    expect(text).not.toContain("Hilde");
    expect(text).not.toContain("Axel");
  });

  it("renders names + labels when relationships are present", () => {
    const text = renderReflectInstructions([
      { name: "Marieke", relationshipLabel: "partner", notes: null },
      { name: "Hilde", relationshipLabel: "daughter", notes: null },
      { name: "Axel", relationshipLabel: "son", notes: null },
    ]);
    expect(text).toContain("Important people in the user's life:");
    expect(text).toContain("Marieke (partner)");
    expect(text).toContain("Hilde (daughter)");
    expect(text).toContain("Axel (son)");
    // The "use the relationship label sparingly" instruction is part
    // of the locked wording per spec.
    expect(text).toMatch(/relationship label sparingly/);
  });

  it("appends notes when present, omits them when null/blank", () => {
    const text = renderReflectInstructions([
      { name: "Sam", relationshipLabel: "colleague", notes: "co-lead on Project ABC" },
      { name: "Pat", relationshipLabel: "friend", notes: null },
      { name: "Lee", relationshipLabel: "neighbour", notes: "  " },
    ]);
    expect(text).toContain("Sam (colleague) — co-lead on Project ABC");
    expect(text).toContain("Pat (friend)");
    expect(text).not.toMatch(/Pat \(friend\) —/);
    expect(text).toContain("Lee (neighbour)");
    expect(text).not.toMatch(/Lee \(neighbour\) —/);
  });

  it("base reflect instructions no longer reference any specific person", () => {
    // Even with names supplied the base block should be domain-neutral.
    const text = renderReflectInstructions([
      { name: "Z", relationshipLabel: "partner", notes: null },
    ]);
    const baseHalf = text.slice(0, text.indexOf("Important people"));
    expect(baseHalf).not.toContain("Marieke");
    expect(baseHalf).not.toContain("Hilde");
    expect(baseHalf).not.toContain("Axel");
    // The wording was changed from "his own values work" to
    // "their own values work" so the prompt isn't gendered.
    expect(baseHalf).toContain("their own values work");
    expect(baseHalf).not.toContain("his own values work");
  });
});
