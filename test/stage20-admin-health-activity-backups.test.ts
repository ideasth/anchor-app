// Stage 20 (2026-05-17) — Admin health: filesJson surfaces both DBs in backup receipts.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  _setTestDb as setAppSettingsTestDb,
  _resetDbForTest as resetAppSettings,
} from "../server/app-settings";
// Direct import of storage module internals to test backup receipt methods.
import { storage } from "../server/storage";

describe("Stage 20 — backup receipt filesJson", () => {
  it("recordBackupReceipt stores filesJson and latestBackupReceipt returns it", () => {
    const filesJson = JSON.stringify([{ name: "data.db" }, { name: "activity.db" }]);
    const r = storage.recordBackupReceipt({
      onedriveUrl: "onedrive://Backups/test.tar.zst",
      mtime: Date.now(),
      sizeBytes: 12345,
      note: "test",
      filesJson,
    });
    expect(r.id).toBeTypeOf("number");

    const latest = storage.latestBackupReceipt();
    expect(latest).not.toBeNull();
    expect(latest?.filesJson).toBeTruthy();

    // Parse and verify both DB names are present.
    const files = JSON.parse(latest!.filesJson) as Array<{ name: string }>;
    const names = files.map((f) => f.name ?? f);
    expect(names).toContain("data.db");
    expect(names).toContain("activity.db");
  });

  it("recentBackupReceipts includes filesJson field", () => {
    const filesJson = JSON.stringify(["data.db", "activity.db"]);
    storage.recordBackupReceipt({
      onedriveUrl: "onedrive://Backups/another.tar.zst",
      mtime: Date.now(),
      sizeBytes: 99999,
      note: "recent test",
      filesJson,
    });
    const receipts = storage.recentBackupReceipts(5);
    expect(receipts.length).toBeGreaterThanOrEqual(1);
    expect(receipts[0].filesJson).toBeTruthy();
  });

  it("latestBackupReceipt returns filesJson='[]' when not set (default)", () => {
    // Insert without filesJson.
    const db = (storage as any).__proto__.constructor;
    // Use the storage API which now always sets files_json.
    const r = storage.recordBackupReceipt({
      onedriveUrl: "onedrive://Backups/no-files.tar.zst",
      mtime: Date.now(),
      sizeBytes: 0,
    });
    const latest = storage.latestBackupReceipt();
    expect(latest?.filesJson).toBeTruthy();
    // Either '[]' or an array serialised as string.
    const parsed = JSON.parse(latest!.filesJson);
    expect(Array.isArray(parsed)).toBe(true);
  });
});
