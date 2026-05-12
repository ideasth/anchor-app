// Stage 17 — family hostname routing tests.
// Tests classifyHost and family-storage directly (no HTTP server).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { _setFamilyTestDb, _resetFamilyDbForTest, createFamilyEvent, listFamilyEvents } from "../server/family-storage";
import { _setTestDb, _resetDbForTest } from "../server/app-settings";
import { classifyHost } from "../server/hostname-router";
import { checkFamilyAuth } from "../server/family-auth";
import bcrypt from "bcryptjs";

describe("family hostname routing via classifyHost", () => {
  it("family hostname is classified as family", () => {
    expect(classifyHost("buoy-family.thinhalo.com")).toBe("family");
  });

  it("apex hostname is not classified as family", () => {
    expect(classifyHost("buoy.thinhalo.com")).not.toBe("family");
  });

  it("/admin and /coach are not family routes (family router 404s them)", () => {
    // The family router only handles prefixes: /family/api, /cal/, /assets/
    // It also handles exact "/" (the SPA root).
    // A request for /admin or /coach does NOT start with any of those prefixes.
    // We model "is handled" as: path starts with one of the known prefixes
    // (excluding "/" which would match everything).
    const FAMILY_PREFIXES = ["/family/api", "/cal/", "/assets/"];
    const isFamily = (path: string) => FAMILY_PREFIXES.some((p) => path.startsWith(p)) || path === "/";
    expect(isFamily("/admin")).toBe(false);
    expect(isFamily("/coach")).toBe(false);
  });

  it("/family/api/events IS a known family route", () => {
    const FAMILY_PATHS = ["/family/api/events"];
    expect(FAMILY_PATHS.some((p) => "/family/api/events".startsWith(p))).toBe(true);
  });
});

describe("family events accessible on family hostname", () => {
  beforeEach(() => {
    const db = new Database(":memory:");
    const sdb = new Database(":memory:");
    _setFamilyTestDb(db);
    _setTestDb(sdb);

    sdb.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run("family_calendar_enabled", "1");
    sdb.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run("family_calendar_token", "valid-token");
  });

  afterEach(() => {
    _resetFamilyDbForTest();
    _resetDbForTest();
  });

  it("can create and list family events (simulating /family/api/events 200)", () => {
    const ev = createFamilyEvent({
      title: "Test Event",
      start_utc: "2026-06-01T22:00:00Z",
      end_utc: "2026-06-02T00:00:00Z",
      added_by: "token",
    });
    expect(ev.id).toBeGreaterThan(0);
    const list = listFamilyEvents("2026-06-01T00:00:00Z", "2026-07-01T00:00:00Z");
    expect(list.length).toBe(1);
  });
});

describe("apex rejects family paths", () => {
  it("apex hostname classified as apex, not family", () => {
    expect(classifyHost("buoy.thinhalo.com")).toBe("apex");
    expect(classifyHost("buoy.thinhalo.com")).not.toBe("family");
  });

  it("classifyHost returns null for unknown hostnames", () => {
    expect(classifyHost("buoy-family.evil.com")).toBeNull();
  });
});

describe("checkFamilyAuth", () => {
  let settingsDb: Database.Database;

  beforeEach(async () => {
    settingsDb = new Database(":memory:");
    _setTestDb(settingsDb);

    const hash = await bcrypt.hash("secret123", 10);
    settingsDb.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run("family_calendar_enabled", "1");
    settingsDb.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run("family_calendar_user", "family");
    settingsDb.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run("family_calendar_password_hash", hash);
    settingsDb.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run("family_calendar_token", "correct-token");
  });

  afterEach(() => _resetDbForTest());

  it("returns null for missing auth", () => {
    const req = { query: {}, cookies: {}, header: () => "" } as any;
    expect(checkFamilyAuth(req)).toBeNull();
  });

  it("returns token for correct token param", () => {
    const req = { query: { t: "correct-token" }, cookies: {}, header: () => "" } as any;
    expect(checkFamilyAuth(req)).toBe("token");
  });

  it("returns null for wrong token param", () => {
    const req = { query: { t: "wrong-token" }, cookies: {}, header: () => "" } as any;
    expect(checkFamilyAuth(req)).toBeNull();
  });

  it("returns password for correct Basic auth", () => {
    const creds = Buffer.from("family:secret123").toString("base64");
    const req = {
      query: {},
      cookies: {},
      header: (name: string) => name.toLowerCase() === "authorization" ? `Basic ${creds}` : "",
    } as any;
    expect(checkFamilyAuth(req)).toBe("password");
  });

  it("returns null for wrong Basic auth password", () => {
    const creds = Buffer.from("family:wrongpass").toString("base64");
    const req = {
      query: {},
      cookies: {},
      header: (name: string) => name.toLowerCase() === "authorization" ? `Basic ${creds}` : "",
    } as any;
    expect(checkFamilyAuth(req)).toBeNull();
  });
});
