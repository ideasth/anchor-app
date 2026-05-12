// Stage 14 (2026-05-12) — Anchor → Buoy rename backwards-compat
// helpers. resolveSyncSecret picks the right env var; readSyncSecretHeader
// picks the right header. Both must accept the legacy Anchor names so
// existing crons + clients keep working through the rename window.

import { describe, expect, it } from "vitest";
import { resolveSyncSecret, readSyncSecretHeader } from "../server/sync-secret";

describe("resolveSyncSecret", () => {
  it("prefers BUOY_SYNC_SECRET when both env vars are set", () => {
    const v = resolveSyncSecret(
      { BUOY_SYNC_SECRET: "new", ANCHOR_SYNC_SECRET: "old" },
      "baked",
    );
    expect(v).toBe("new");
  });

  it("falls back to ANCHOR_SYNC_SECRET when BUOY is absent", () => {
    const v = resolveSyncSecret({ ANCHOR_SYNC_SECRET: "old" }, "baked");
    expect(v).toBe("old");
  });

  it("falls back to the baked value when no env var is set", () => {
    const v = resolveSyncSecret({}, "baked");
    expect(v).toBe("baked");
  });

  it("returns empty string when nothing is configured", () => {
    const v = resolveSyncSecret({}, "");
    expect(v).toBe("");
  });

  it("treats an empty BUOY env var as absent so it can still fall back to ANCHOR", () => {
    const v = resolveSyncSecret(
      { BUOY_SYNC_SECRET: "", ANCHOR_SYNC_SECRET: "old" },
      "baked",
    );
    expect(v).toBe("old");
  });
});

describe("readSyncSecretHeader", () => {
  it("prefers X-Buoy-Sync-Secret when both headers are present", () => {
    const got = readSyncSecretHeader({
      "x-buoy-sync-secret": "new-token",
      "x-anchor-sync-secret": "old-token",
    });
    expect(got).toBe("new-token");
  });

  it("accepts the legacy X-Anchor-Sync-Secret header alone", () => {
    const got = readSyncSecretHeader({
      "x-anchor-sync-secret": "old-token",
    });
    expect(got).toBe("old-token");
  });

  it("accepts the new X-Buoy-Sync-Secret header alone", () => {
    const got = readSyncSecretHeader({
      "x-buoy-sync-secret": "new-token",
    });
    expect(got).toBe("new-token");
  });

  it("returns empty when neither header is set", () => {
    expect(readSyncSecretHeader({})).toBe("");
  });

  it("trims whitespace and handles array header values", () => {
    expect(
      readSyncSecretHeader({ "x-buoy-sync-secret": "  spaced  " }),
    ).toBe("spaced");
    expect(
      readSyncSecretHeader({ "x-anchor-sync-secret": ["array-val"] }),
    ).toBe("array-val");
  });

  it("does not match the legacy header when the new header is empty string", () => {
    // An explicitly-empty new header should still fall through to the
    // legacy one so a misconfigured caller doesn't silently lock out.
    const got = readSyncSecretHeader({
      "x-buoy-sync-secret": "",
      "x-anchor-sync-secret": "old",
    });
    expect(got).toBe("old");
  });
});
