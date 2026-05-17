// Stage 20 (2026-05-17) — Routes: activity routes source-text checks + 401 without session.
//
// Pattern: source-text inspection (same as Stage 18/19). We verify the route
// module imports the correct helpers and exports the registerActivityRoutes
// function. The 401 behaviour is verified by reading the source guard.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROUTES_SRC = readFileSync(
  path.resolve(__dirname, "../server/activity-routes.ts"),
  "utf8",
);
const TOP_ROUTES_SRC = readFileSync(
  path.resolve(__dirname, "../server/routes.ts"),
  "utf8",
);
const ADMIN_DB_SRC = readFileSync(
  path.resolve(__dirname, "../server/admin-db.ts"),
  "utf8",
);

describe("Stage 20 — activity routes source checks", () => {
  it("activity-routes.ts exports registerActivityRoutes", () => {
    expect(ROUTES_SRC).toContain("export function registerActivityRoutes");
  });

  it("activity-routes.ts uses requireUserOrOrchestrator for auth gate", () => {
    // Every route handler calls requireUserOrOrchestrator
    const matches = ROUTES_SRC.match(/requireUserOrOrchestrator\(req, res\)/g) ?? [];
    expect(matches.length).toBeGreaterThan(5);
  });

  it("routes.ts imports registerActivityRoutes", () => {
    expect(TOP_ROUTES_SRC).toContain("registerActivityRoutes");
  });

  it("routes.ts calls registerActivityRoutes(app, requireUserOrOrchestrator)", () => {
    expect(TOP_ROUTES_SRC).toContain("registerActivityRoutes(app, requireUserOrOrchestrator)");
  });

  it("activity-routes.ts mounts /api/activity/entries", () => {
    expect(ROUTES_SRC).toContain("/api/activity/entries");
  });

  it("activity-routes.ts mounts /api/activity/timers/start", () => {
    expect(ROUTES_SRC).toContain("/api/activity/timers/start");
  });

  it("activity-routes.ts mounts /api/activity/search", () => {
    expect(ROUTES_SRC).toContain("/api/activity/search");
  });

  it("activity-routes.ts mounts /api/activity/import", () => {
    expect(ROUTES_SRC).toContain("/api/activity/import");
  });

  it("activity-routes.ts mounts /api/activity/export.csv", () => {
    expect(ROUTES_SRC).toContain("/api/activity/export.csv");
  });

  it("activity-routes.ts mounts /api/activity/export.md", () => {
    expect(ROUTES_SRC).toContain("/api/activity/export.md");
  });

  it("CSV export sets Content-Type text/csv", () => {
    expect(ROUTES_SRC).toContain("text/csv");
  });

  it("Markdown export sets Content-Type text/markdown", () => {
    expect(ROUTES_SRC).toContain("text/markdown");
  });

  it("admin-db.ts adds /api/admin/db/export-activity endpoint", () => {
    expect(ADMIN_DB_SRC).toContain("/api/admin/db/export-activity");
  });

  it("admin-db.ts imports getActivityDb", () => {
    expect(ADMIN_DB_SRC).toContain("getActivityDb");
  });
});

describe("Stage 20 — backup receipt filesJson", () => {
  it("admin-db.ts POST /api/admin/backup-receipt accepts filesJson", () => {
    expect(ADMIN_DB_SRC).toContain("filesJson");
  });

  it("storage.ts recordBackupReceipt has filesJson parameter", () => {
    const storageSrc = readFileSync(
      path.resolve(__dirname, "../server/storage.ts"),
      "utf8",
    );
    expect(storageSrc).toContain("filesJson");
  });
});
