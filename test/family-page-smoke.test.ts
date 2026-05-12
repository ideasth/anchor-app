// Stage 17 — smoke tests for family SPA source files.
// Uses source-text inspection (same pattern as find-time-page.test.tsx).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const FAMILY_APP_SRC = readFileSync(
  path.resolve(__dirname, "../client/family/FamilyApp.tsx"),
  "utf8",
);

const FAMILY_MAIN_SRC = readFileSync(
  path.resolve(__dirname, "../client/family/family-main.tsx"),
  "utf8",
);

const FAMILY_HTML = readFileSync(
  path.resolve(__dirname, "../client/family/index.html"),
  "utf8",
);

describe("family SPA smoke", () => {
  it("FamilyApp.tsx exports default component", () => {
    expect(FAMILY_APP_SRC).toContain("export default function FamilyApp");
  });

  it("family-main.tsx mounts FamilyApp", () => {
    expect(FAMILY_MAIN_SRC).toContain("FamilyApp");
    expect(FAMILY_MAIN_SRC).toContain("createRoot");
  });

  it("family HTML has root div", () => {
    expect(FAMILY_HTML).toContain('<div id="root">');
  });

  it("FamilyApp renders week navigation", () => {
    expect(FAMILY_APP_SRC).toContain("prevWeek");
    expect(FAMILY_APP_SRC).toContain("nextWeek");
  });

  it("FamilyApp has Add Event button", () => {
    expect(FAMILY_APP_SRC).toContain("Add Event");
  });

  it("FamilyApp uses /family/api/events endpoint", () => {
    expect(FAMILY_APP_SRC).toContain("/family/api/events");
  });

  it("FamilyApp uses /family/api/notes/day and week", () => {
    expect(FAMILY_APP_SRC).toContain("/family/api/notes/day");
    expect(FAMILY_APP_SRC).toContain("/family/api/notes/week");
  });

  it("EventDialog has count_as_busy_for_public checkbox", () => {
    expect(FAMILY_APP_SRC).toContain("count_as_busy_for_public");
  });

  it("no emoji in family SPA source", () => {
    // Reject any emoji character ranges in the source files
    const emojiRe = /[\u{1F300}-\u{1FFFF}]/u;
    expect(emojiRe.test(FAMILY_APP_SRC)).toBe(false);
    expect(emojiRe.test(FAMILY_MAIN_SRC)).toBe(false);
  });
});
