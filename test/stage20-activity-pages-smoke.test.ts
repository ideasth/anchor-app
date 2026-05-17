// Stage 20 (2026-05-17) — Smoke tests for Activity SPA pages.
// Source-text inspection pattern.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const DASHBOARD_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/pages/Activity/Dashboard.tsx"),
  "utf8",
);
const REPORTS_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/pages/Activity/Reports.tsx"),
  "utf8",
);
const SEARCH_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/pages/Activity/Search.tsx"),
  "utf8",
);
const IMPORT_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/pages/Activity/Import.tsx"),
  "utf8",
);
const SETTINGS_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/pages/Activity/SettingsActivity.tsx"),
  "utf8",
);
const APP_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/App.tsx"),
  "utf8",
);
const TODAY_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/pages/Today.tsx"),
  "utf8",
);

describe("Stage 20 — Activity Dashboard smoke", () => {
  it("calls /api/activity/timers/current", () => {
    expect(DASHBOARD_SRC).toContain("/api/activity/timers/current");
  });
  it("calls /api/activity/reports/day", () => {
    expect(DASHBOARD_SRC).toContain("/api/activity/reports/day");
  });
  it("calls /api/activity/reports/week", () => {
    expect(DASHBOARD_SRC).toContain("/api/activity/reports/week");
  });
  it("renders a Stop button for active timer", () => {
    expect(DASHBOARD_SRC).toContain("Stop");
  });
  it("links to /activity/import", () => {
    expect(DASHBOARD_SRC).toContain("/activity/import");
  });
  it("links to /activity/reports", () => {
    expect(DASHBOARD_SRC).toContain("/activity/reports");
  });
});

describe("Stage 20 — Activity Reports smoke", () => {
  it("calls /api/activity/reports/by-category", () => {
    expect(REPORTS_SRC).toContain("/api/activity/reports/by-category");
  });
  it("calls /api/activity/reports/by-subcategory", () => {
    expect(REPORTS_SRC).toContain("/api/activity/reports/by-subcategory");
  });
  it("has CSV export link", () => {
    expect(REPORTS_SRC).toContain("export.csv");
  });
  it("has Markdown export link", () => {
    expect(REPORTS_SRC).toContain("export.md");
  });
  it("has date-range presets", () => {
    expect(REPORTS_SRC).toContain("Last 7 days");
    expect(REPORTS_SRC).toContain("Last 30 days");
  });
});

describe("Stage 20 — Activity Search smoke", () => {
  it("calls /api/activity/search", () => {
    expect(SEARCH_SRC).toContain("/api/activity/search");
  });
  it("renders snippet with « » markers", () => {
    expect(SEARCH_SRC).toContain("«");
    expect(SEARCH_SRC).toContain("»");
  });
  it("has a search input", () => {
    expect(SEARCH_SRC).toContain("<input");
  });
});

describe("Stage 20 — Activity Import smoke", () => {
  it("calls /api/activity/import", () => {
    expect(IMPORT_SRC).toContain("/api/activity/import");
  });
  it("has dry run button", () => {
    expect(IMPORT_SRC).toContain("Dry run");
  });
  it("has autocreate toggle", () => {
    expect(IMPORT_SRC).toContain("autocreate");
  });
  it("shows import results", () => {
    expect(IMPORT_SRC).toContain("created");
  });
});

describe("Stage 20 — Settings Activity smoke", () => {
  it("calls /api/activity/categories", () => {
    expect(SETTINGS_SRC).toContain("/api/activity/categories");
  });
  it("calls /api/activity/subcategories", () => {
    expect(SETTINGS_SRC).toContain("/api/activity/subcategories");
  });
  it("references coach.include_activity_summary", () => {
    expect(SETTINGS_SRC).toContain("activity_summary");
  });
});

describe("Stage 20 — App.tsx routes Activity pages", () => {
  it("routes /activity to ActivityDashboard", () => {
    expect(APP_SRC).toContain("/activity");
    expect(APP_SRC).toContain("ActivityDashboard");
  });
  it("routes /activity/reports to ActivityReports", () => {
    expect(APP_SRC).toContain("/activity/reports");
  });
  it("routes /activity/search to ActivitySearch", () => {
    expect(APP_SRC).toContain("/activity/search");
  });
  it("routes /activity/import to ActivityImport", () => {
    expect(APP_SRC).toContain("/activity/import");
  });
  it("routes /settings/activity to SettingsActivity", () => {
    expect(APP_SRC).toContain("/settings/activity");
  });
});

describe("Stage 20 — Today page Activity strip", () => {
  it("has ActivityTodayStrip component", () => {
    expect(TODAY_SRC).toContain("ActivityTodayStrip");
  });
  it("calls /api/activity/reports/day", () => {
    expect(TODAY_SRC).toContain("/api/activity/reports/day");
  });
  it("links to /activity", () => {
    expect(TODAY_SRC).toContain("/activity");
  });
  it("has data-testid section-today-activity", () => {
    expect(TODAY_SRC).toContain("section-today-activity");
  });
});
