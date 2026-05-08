import { describe, it, expect, beforeEach } from "vitest";
import { recordError, listErrors, clearErrors, ringSize } from "../server/error-buffer";

describe("error-buffer", () => {
  beforeEach(() => {
    clearErrors();
  });

  it("starts empty", () => {
    expect(listErrors()).toEqual([]);
    expect(ringSize()).toBe(100);
  });

  it("records errors with the expected shape", () => {
    const e = new Error("boom");
    recordError({ err: e, statusCode: 500, method: "GET", path: "/api/x" });
    const list = listErrors();
    expect(list.length).toBe(1);
    expect(list[0].message).toBe("boom");
    expect(list[0].statusCode).toBe(500);
    expect(list[0].method).toBe("GET");
    expect(list[0].path).toBe("/api/x");
    expect(typeof list[0].createdAt).toBe("number");
    expect(list[0].stack).toContain("boom");
  });

  it("strips querystring from path (no body/query data leaked)", () => {
    recordError({ err: new Error("x"), path: "/api/x?secret=hunter2" });
    const list = listErrors();
    expect(list[0].path).toBe("/api/x");
    expect(list[0].path).not.toContain("hunter2");
  });

  it("returns most-recent first", () => {
    recordError({ err: new Error("first") });
    recordError({ err: new Error("second") });
    recordError({ err: new Error("third") });
    const list = listErrors();
    expect(list.map((e) => e.message)).toEqual(["third", "second", "first"]);
  });

  it("respects the ring size cap (100)", () => {
    for (let i = 0; i < 150; i++) recordError({ err: new Error(`err-${i}`) });
    const list = listErrors();
    expect(list.length).toBe(100);
    // The oldest 50 should have been dropped; first message should be err-149.
    expect(list[0].message).toBe("err-149");
    expect(list[99].message).toBe("err-50");
  });

  it("limit query parameter caps result count", () => {
    for (let i = 0; i < 20; i++) recordError({ err: new Error(`e${i}`) });
    expect(listErrors(5).length).toBe(5);
    expect(listErrors(5)[0].message).toBe("e19");
  });

  it("truncates very long messages and stacks", () => {
    const longMsg = "x".repeat(1000);
    recordError({ err: new Error(longMsg) });
    const list = listErrors();
    expect(list[0].message.length).toBeLessThan(1000);
    expect(list[0].message).toContain("truncated");
  });

  it("clearErrors returns the removed count and empties the buffer", () => {
    recordError({ err: new Error("a") });
    recordError({ err: new Error("b") });
    expect(clearErrors()).toBe(2);
    expect(listErrors()).toEqual([]);
  });

  it("survives non-Error inputs without crashing", () => {
    recordError({ err: "raw string error" });
    recordError({ err: { message: "plain object" } });
    recordError({ err: null });
    expect(listErrors().length).toBe(3);
  });
});
