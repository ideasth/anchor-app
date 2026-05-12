// Stage 17 — classifyHost() tests
import { describe, it, expect } from "vitest";
import { classifyHost } from "../server/hostname-router";

describe("classifyHost", () => {
  it("returns apex for buoy.thinhalo.com", () => {
    expect(classifyHost("buoy.thinhalo.com")).toBe("apex");
  });

  it("returns apex for anchor.thinhalo.com (back-compat)", () => {
    expect(classifyHost("anchor.thinhalo.com")).toBe("apex");
  });

  it("returns family for buoy-family.thinhalo.com", () => {
    expect(classifyHost("buoy-family.thinhalo.com")).toBe("family");
  });

  it("returns availability for oliver-availability.thinhalo.com", () => {
    expect(classifyHost("oliver-availability.thinhalo.com")).toBe("availability");
  });

  it("returns apex for localhost (dev fallback)", () => {
    expect(classifyHost("localhost")).toBe("apex");
  });

  it("returns apex for 127.0.0.1 (dev fallback)", () => {
    expect(classifyHost("127.0.0.1")).toBe("apex");
  });

  it("returns apex for *.pplx.app (dev fallback)", () => {
    expect(classifyHost("anchor-jod.pplx.app")).toBe("apex");
  });

  it("returns null for unknown hostname", () => {
    expect(classifyHost("evil.example.com")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(classifyHost(undefined)).toBeNull();
  });

  it("strips port before classifying", () => {
    expect(classifyHost("buoy-family.thinhalo.com:5000")).toBe("family");
    expect(classifyHost("oliver-availability.thinhalo.com:443")).toBe("availability");
  });

  it("is case-insensitive", () => {
    expect(classifyHost("BUOY.THINHALO.COM")).toBe("apex");
    expect(classifyHost("Buoy-Family.thinhalo.com")).toBe("family");
  });
});
