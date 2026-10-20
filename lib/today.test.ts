import { describe, expect, it } from "vitest";
import { localDate } from "./dates";
import { goalMet, initials, lastSevenDays, ringOffset } from "./today";

const now = new Date("2026-10-19T23:30:00Z");

describe("lastSevenDays", () => {
  it("ends on the user's local today across a UTC day boundary", () => {
    expect(lastSevenDays(localDate("Asia/Manila", now))).toEqual([
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
      "2026-10-19",
      "2026-10-20",
    ]);
    const la = lastSevenDays(localDate("America/Los_Angeles", now));
    expect(la[6]).toBe("2026-10-19");
    expect(la[0]).toBe("2026-10-13");
  });
  it("crosses a month boundary and returns 7 days", () => {
    const days = lastSevenDays("2026-03-03");
    expect(days[0]).toBe("2026-02-25");
    expect(days).toHaveLength(7);
  });
});

describe("ringOffset", () => {
  it("clamps to [0, 1] with over-target as full", () => {
    expect(ringOffset(0, 150)).toBe(1);
    expect(ringOffset(75, 150)).toBe(0.5);
    expect(ringOffset(150, 150)).toBe(0);
    expect(ringOffset(300, 150)).toBe(0);
    expect(ringOffset(-1, 150)).toBe(1);
  });
  it("handles a zero target", () => {
    expect(ringOffset(0, 0)).toBe(0);
    expect(ringOffset(5, 0)).toBe(1);
  });
});

describe("goalMet", () => {
  it("is inclusive at 90–110% of the rounded calories", () => {
    expect(goalMet(1800, 2000)).toBe(true);
    expect(goalMet(1799, 2000)).toBe(false);
    expect(goalMet(2200, 2000)).toBe(true);
    expect(goalMet(2201, 2000)).toBe(false);
    expect(goalMet(1799.5, 2000)).toBe(true);
    expect(goalMet(2200.5, 2000)).toBe(false);
  });
  it("is false without a usable target", () => {
    expect(goalMet(1900, null)).toBe(false);
    expect(goalMet(0, 2000)).toBe(false);
  });
});

describe("initials", () => {
  it("takes the first letter of the first two local-part words", () => {
    expect(initials("dean.mark@example.test")).toBe("DM");
    expect(initials("dean@example.test")).toBe("D");
    expect(initials("e2e-123-abc@example.test")).toBe("E1");
  });
  it("falls back to ? when nothing usable is left", () => {
    expect(initials("@x")).toBe("?");
    expect(initials("")).toBe("?");
  });
});
