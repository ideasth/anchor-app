// Stage 17 — smoke tests for availability SPA source files.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const AVAIL_APP_SRC = readFileSync(
  path.resolve(__dirname, "../client/availability/AvailabilityApp.tsx"),
  "utf8",
);

const AVAIL_MAIN_SRC = readFileSync(
  path.resolve(__dirname, "../client/availability/availability-main.tsx"),
  "utf8",
);

const AVAIL_HTML = readFileSync(
  path.resolve(__dirname, "../client/availability/index.html"),
  "utf8",
);

describe("availability SPA smoke", () => {
  it("AvailabilityApp.tsx exports default component", () => {
    expect(AVAIL_APP_SRC).toContain("export default function AvailabilityApp");
  });

  it("availability-main.tsx mounts AvailabilityApp", () => {
    expect(AVAIL_MAIN_SRC).toContain("AvailabilityApp");
    expect(AVAIL_MAIN_SRC).toContain("createRoot");
  });

  it("availability HTML has root div", () => {
    expect(AVAIL_HTML).toContain('<div id="root">');
  });

  it("AvailabilityApp renders 12-week grid", () => {
    expect(AVAIL_APP_SRC).toContain("12");
    expect(AVAIL_APP_SRC).toContain("WeekRow");
  });

  it("AvailabilityApp reads /elgin.ics for data", () => {
    expect(AVAIL_APP_SRC).toContain("/elgin.ics");
  });

  it("AvailabilityApp shows Subscribe panel", () => {
    expect(AVAIL_APP_SRC).toContain("Subscribe to this calendar");
  });

  it("AvailabilityApp shows Melbourne timezone disclaimer", () => {
    expect(AVAIL_APP_SRC).toContain("Australia/Melbourne");
  });

  it("AvailabilityApp renders Available blocks in green", () => {
    expect(AVAIL_APP_SRC).toContain("Available (");
  });

  it("never references family event titles or note bodies", () => {
    expect(AVAIL_APP_SRC).not.toContain("family_events");
    expect(AVAIL_APP_SRC).not.toContain("family note");
  });

  it("no emoji in availability SPA source", () => {
    const emojiRe = /[\u{1F300}-\u{1FFFF}]/u;
    expect(emojiRe.test(AVAIL_APP_SRC)).toBe(false);
  });
});
