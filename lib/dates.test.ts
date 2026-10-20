import { describe, expect, it } from "vitest";
import { addDays, localDate, resolveTimeZone } from "./dates";

const now = new Date("2026-10-19T23:30:00Z");

describe("localDate", () => {
  it("uses the user's zone across a UTC day boundary", () => {
    expect(localDate("Asia/Manila", now)).toBe("2026-10-20");
    expect(localDate("America/Los_Angeles", now)).toBe("2026-10-19");
  });
});

describe("resolveTimeZone", () => {
  it("falls back to UTC for invalid or missing zones", () => {
    expect(resolveTimeZone("Not/AZone")).toBe("UTC");
    expect(resolveTimeZone(undefined)).toBe("UTC");
    expect(resolveTimeZone("A".repeat(65))).toBe("UTC");
  });
  it("keeps a valid zone", () => {
    expect(resolveTimeZone("Europe/Berlin")).toBe("Europe/Berlin");
  });
});

describe("addDays", () => {
  it("does calendar arithmetic", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-20", -29)).toBe("2026-09-21");
  });
});
