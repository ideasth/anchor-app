// Stage 14 phase 2 (2026-05-12) — token rename + migration shim in
// client/src/lib/queryClient.ts. With a mocked localStorage the
// module-load migration must copy anchor_token -> buoy_token when
// only the legacy key is present, and the outgoing-header builder
// must emit X-Buoy-Token (not X-Anchor-Token).
//
// We import the module twice with vi.resetModules() between cases so
// the top-level migration block runs against the per-test storage.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeLocalStorage {
  store: Map<string, string> = new Map();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

interface GlobalWithLocalStorage {
  localStorage?: FakeLocalStorage;
  fetch?: typeof globalThis.fetch;
}

const g = globalThis as unknown as GlobalWithLocalStorage;

describe("queryClient token rename + migration", () => {
  let ls: FakeLocalStorage;
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    ls = new FakeLocalStorage();
    g.localStorage = ls;
    originalFetch = g.fetch;
    g.fetch = vi.fn(
      async () =>
        new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
    ) as typeof globalThis.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    delete g.localStorage;
    if (originalFetch) g.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("copies anchor_token to buoy_token at module load when only the legacy key is present", async () => {
    ls.setItem("anchor_token", "tok-abc");
    await import("../client/src/lib/queryClient");
    expect(ls.getItem("buoy_token")).toBe("tok-abc");
    // The legacy key is intentionally retained for one release so a
    // revert to a pre-rename build still works.
    expect(ls.getItem("anchor_token")).toBe("tok-abc");
  });

  it("does not overwrite an existing buoy_token", async () => {
    ls.setItem("anchor_token", "old");
    ls.setItem("buoy_token", "new");
    await import("../client/src/lib/queryClient");
    expect(ls.getItem("buoy_token")).toBe("new");
    expect(ls.getItem("anchor_token")).toBe("old");
  });

  it("apiRequest sends X-Buoy-Token (not X-Anchor-Token)", async () => {
    ls.setItem("buoy_token", "tok-zzz");
    const { apiRequest } = await import("../client/src/lib/queryClient");
    await apiRequest("GET", "/api/health");
    const fetchMock = g.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalled();
    const init = (fetchMock.mock.calls[0]?.[1] ?? {}) as RequestInit;
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["X-Buoy-Token"]).toBe("tok-zzz");
    expect(headers).not.toHaveProperty("X-Anchor-Token");
    expect(headers["Authorization"]).toBe("Bearer tok-zzz");
  });

  it("setStoredToken writes to the buoy_token key", async () => {
    const mod = await import("../client/src/lib/queryClient");
    mod.setStoredToken("fresh-tok");
    expect(ls.getItem("buoy_token")).toBe("fresh-tok");
    expect(ls.getItem("anchor_token")).toBeNull();
  });

  it("survives a missing localStorage (SSR / disabled-storage path)", async () => {
    delete g.localStorage;
    // The import must not throw even though localStorage is undefined.
    await expect(import("../client/src/lib/queryClient")).resolves.toBeDefined();
  });
});
