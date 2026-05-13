// Stage 17/17b — smoke tests for the family SPA source files.
// Uses source-text inspection (same pattern as find-time-page.test.tsx).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const FAMILY_MAIN_SRC = readFileSync(
  path.resolve(__dirname, "../client/family/family-main.tsx"),
  "utf8",
);

const FAMILY_HTML = readFileSync(
  path.resolve(__dirname, "../client/family/index.html"),
  "utf8",
);

const FAMILY_ROUTES_SRC = readFileSync(
  path.resolve(__dirname, "../server/family-routes.ts"),
  "utf8",
);

const AVAILABILITY_ROUTES_SRC = readFileSync(
  path.resolve(__dirname, "../server/availability-routes.ts"),
  "utf8",
);

describe("family SPA smoke", () => {
  it("family HTML has root div", () => {
    expect(FAMILY_HTML).toContain('<div id="root">');
  });

  // Stage 17b: the family SPA now renders the apex CalendarPlanner directly
  // (same year-grouped calendar Marieke sees on apex).
  it("family-main.tsx mounts CalendarPlanner", () => {
    expect(FAMILY_MAIN_SRC).toContain("CalendarPlanner");
    expect(FAMILY_MAIN_SRC).toContain("createRoot");
    expect(FAMILY_MAIN_SRC).toContain("QueryClientProvider");
  });

  it("family-main.tsx persists token from ?t= into localStorage", () => {
    // The bootstrap helper must store the token via setStoredToken so the
    // apex apiRequest helper appends ?t= to every subsequent API call.
    expect(FAMILY_MAIN_SRC).toContain("setStoredToken");
    expect(FAMILY_MAIN_SRC).toMatch(/searchParams\.get\(["']t["']\)/);
  });

  // Stage 17b: family router exposes apex planner endpoints at the same
  // paths the apex client expects, so CalendarPlanner works without any
  // hostname-aware client logic.
  it("family router exposes /api/planner/events", () => {
    expect(FAMILY_ROUTES_SRC).toContain('"/api/planner/events"');
  });

  it("family router exposes /api/planner/notes (GET and PUT)", () => {
    expect(FAMILY_ROUTES_SRC).toContain('"/api/planner/notes"');
    expect(FAMILY_ROUTES_SRC).toContain('"/api/planner/notes/:date"');
  });

  it("family router exposes /api/today-events", () => {
    expect(FAMILY_ROUTES_SRC).toContain('"/api/today-events"');
  });

  it("family router exposes /api/travel/today", () => {
    expect(FAMILY_ROUTES_SRC).toContain('"/api/travel/today"');
  });

  it("family router exposes /api/scheduling/search", () => {
    expect(FAMILY_ROUTES_SRC).toContain('"/api/scheduling/search"');
  });

  it("family router exposes /api/planner/export", () => {
    expect(FAMILY_ROUTES_SRC).toContain('"/api/planner/export"');
  });

  it("family router exposes /api/auth/status (synthetic OK)", () => {
    expect(FAMILY_ROUTES_SRC).toContain('"/api/auth/status"');
  });

  // Family-specific endpoints (family_events table) are still here.
  it("family router keeps /family/api/events CRUD", () => {
    expect(FAMILY_ROUTES_SRC).toContain('"/family/api/events"');
  });

  it("family router keeps /family/api/notes/day and week", () => {
    expect(FAMILY_ROUTES_SRC).toContain('"/family/api/notes/day/:date"');
    expect(FAMILY_ROUTES_SRC).toContain('"/family/api/notes/week/:isoweek"');
  });

  // Regression — Stage 17 hotfix.
  // Vite emits a single shared dist/public/assets/ dir; index.html lives at
  // dist/public/family/index.html and references assets as `../assets/...`.
  // In the browser that resolves to /assets/<file>, so the Express handler
  // MUST serve from dist/public/assets, NOT dist/public/family/assets.
  it("family /assets handler serves from shared dist/public/assets", () => {
    expect(FAMILY_ROUTES_SRC).toMatch(/path\.resolve\(__dirname,\s*"public",\s*"assets"\)/);
    expect(FAMILY_ROUTES_SRC).not.toMatch(
      /distBase\s*=\s*path\.resolve\(__dirname,\s*"public",\s*"family"\)/,
    );
  });

  it("availability /assets handler serves from shared dist/public/assets", () => {
    expect(AVAILABILITY_ROUTES_SRC).toMatch(/path\.resolve\(__dirname,\s*"public",\s*"assets"\)/);
    expect(AVAILABILITY_ROUTES_SRC).not.toMatch(
      /distBase\s*=\s*path\.resolve\(__dirname,\s*"public",\s*"availability"\)/,
    );
  });

  it("no emoji in family-main.tsx", () => {
    const emojiRe = /[\u{1F300}-\u{1FFFF}]/u;
    expect(emojiRe.test(FAMILY_MAIN_SRC)).toBe(false);
  });
});
