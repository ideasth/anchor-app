// Stage 16 (2026-05-12) — FindTime page smoke tests.
//
// Follows the same pattern as relationships-page.test.tsx: module-shape
// and locked-copy checks (no RTL render — jsdom not in the vitest env).
// Tests import the source text to verify spec-locked copy and data-testids.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const PAGE_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/pages/FindTime.tsx"),
  "utf8",
);

const SOURCE_CHIPS_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/components/find-time/SourceChips.tsx"),
  "utf8",
);

const PROMPT_INPUT_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/components/find-time/PromptInput.tsx"),
  "utf8",
);

const PARSED_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/components/find-time/ParsedInterpretation.tsx"),
  "utf8",
);

const CANDIDATES_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/components/find-time/CandidateSlots.tsx"),
  "utf8",
);

const CLARIFICATION_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/components/find-time/ClarificationBanner.tsx"),
  "utf8",
);

describe("FindTime page (smoke)", () => {
  it("module loads and exports a default React component function", async () => {
    const mod = await import("../client/src/pages/FindTime");
    expect(typeof mod.default).toBe("function");
  });

  it("exports a compact prop for dialog mode", () => {
    // Check the prop signature is present in source.
    expect(PAGE_SRC).toContain("compact");
    expect(PAGE_SRC).toContain("compact = false");
  });

  it("renders page title in standalone mode", () => {
    expect(PAGE_SRC).toMatch(/find-time-title/);
    expect(PAGE_SRC).toContain("Find a time");
  });

  it("composes all required sub-components", () => {
    expect(PAGE_SRC).toContain("SourceChips");
    expect(PAGE_SRC).toContain("PromptInput");
    expect(PAGE_SRC).toContain("ParsedInterpretation");
    expect(PAGE_SRC).toContain("CandidateSlots");
    expect(PAGE_SRC).toContain("ClarificationBanner");
  });

  it("calls the /api/scheduling/search endpoint", () => {
    expect(PAGE_SRC).toContain("/api/scheduling/search");
  });

  it("passes sources to the search body", () => {
    expect(PAGE_SRC).toContain("sources");
  });
});

describe("SourceChips (smoke)", () => {
  it("module loads and exports SourceChips", async () => {
    const mod = await import("../client/src/components/find-time/SourceChips");
    expect(typeof mod.SourceChips).toBe("function");
  });

  it("includes 'My Outlook' and 'My Buoy events' as default chips", () => {
    expect(SOURCE_CHIPS_SRC).toContain("My Outlook");
    expect(SOURCE_CHIPS_SRC).toContain("My Buoy events");
  });

  it("both fixed chips default to ON", () => {
    expect(SOURCE_CHIPS_SRC).toContain("defaultOn: true");
  });

  it("persists state in localStorage using the right key", () => {
    expect(SOURCE_CHIPS_SRC).toContain("findTimeSources");
  });

  it("emits chip testids", () => {
    expect(SOURCE_CHIPS_SRC).toContain("chip-${chip.key}");
  });

  it("source-chips container testid is present", () => {
    expect(SOURCE_CHIPS_SRC).toContain("source-chips");
  });
});

describe("PromptInput (smoke)", () => {
  it("module loads and exports PromptInput", async () => {
    const mod = await import("../client/src/components/find-time/PromptInput");
    expect(typeof mod.PromptInput).toBe("function");
  });

  it("has correct testids", () => {
    expect(PROMPT_INPUT_SRC).toContain("prompt-input");
    expect(PROMPT_INPUT_SRC).toContain("prompt-submit");
  });

  it("shows loading state on button", () => {
    expect(PROMPT_INPUT_SRC).toContain("Searching");
  });
});

describe("ParsedInterpretation (smoke)", () => {
  it("module loads and exports ParsedInterpretation", async () => {
    const mod = await import("../client/src/components/find-time/ParsedInterpretation");
    expect(typeof mod.ParsedInterpretation).toBe("function");
  });

  it("has duration stepper testids", () => {
    expect(PARSED_SRC).toContain("duration-minus");
    expect(PARSED_SRC).toContain("duration-plus");
    expect(PARSED_SRC).toContain("duration-value");
  });

  it("renders part-of-day pills", () => {
    expect(PARSED_SRC).toContain("morning");
    expect(PARSED_SRC).toContain("afternoon");
    expect(PARSED_SRC).toContain("evening");
  });

  it("calls onRefinement on edit", () => {
    expect(PARSED_SRC).toContain("onRefinement");
  });
});

describe("CandidateSlots (smoke)", () => {
  it("module loads and exports CandidateSlots", async () => {
    const mod = await import("../client/src/components/find-time/CandidateSlots");
    expect(typeof mod.CandidateSlots).toBe("function");
  });

  it("shows online/in-person badges", () => {
    expect(CANDIDATES_SRC).toContain("Online");
    expect(CANDIDATES_SRC).toContain("In person");
  });

  it("shows travel-applied badge", () => {
    expect(CANDIDATES_SRC).toContain("Travel included");
  });

  it("has no-candidates message", () => {
    expect(CANDIDATES_SRC).toContain("No available slots found");
  });
});

describe("ClarificationBanner (smoke)", () => {
  it("module loads and exports ClarificationBanner", async () => {
    const mod = await import("../client/src/components/find-time/ClarificationBanner");
    expect(typeof mod.ClarificationBanner).toBe("function");
  });

  it("renders with clarification-banner testid", () => {
    expect(CLARIFICATION_SRC).toContain("clarification-banner");
  });

  it("renders per-field missing testids", () => {
    expect(CLARIFICATION_SRC).toContain("missing-${field}");
  });
});

describe("CalendarPlanner — Find a time button wired", () => {
  it("CalendarPlanner exports a default component", async () => {
    const mod = await import("../client/src/pages/CalendarPlanner");
    expect(typeof mod.default).toBe("function");
  });

  it("CalendarPlanner source includes the Find a time button", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../client/src/pages/CalendarPlanner.tsx"),
      "utf8",
    );
    expect(src).toContain("button-find-time");
    expect(src).toContain("Find a time");
    expect(src).toContain("find-time-dialog");
    expect(src).toContain("FindTime compact");
  });
});

describe("App.tsx — /find-time route added", () => {
  it("App.tsx includes the /find-time route and FindTime import", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../client/src/App.tsx"),
      "utf8",
    );
    expect(src).toContain("/find-time");
    expect(src).toContain("FindTime");
  });
});
