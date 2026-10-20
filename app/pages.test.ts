import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  claims: { sub: "u1" } as object | null,
  result: { data: null, error: null } as { data: unknown; error: { code: string } | null },
  calls: [] as [string, ...unknown[]][],
}));

// Chainable PostgREST stand-in that records each call and resolves to state.result.
const query = (): unknown =>
  new Proxy(() => {}, {
    get: (_t, prop) =>
      prop === "then"
        ? (res: (v: unknown) => void) => res(state.result)
        : (...args: unknown[]) => {
            state.calls.push([String(prop), ...args]);
            return query();
          },
  });

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: async () => ({ data: state.claims ? { claims: state.claims } : null }) }, from: () => query() }),
  requireUser: async () => ({ supabase: { from: () => query() }, userId: "u1", email: "dean@example.test" }),
  getToday: async () => ({ date: "2026-10-20", timeZone: "UTC" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));

import TodayPage from "@/app/(app)/page";
import HistoryPage from "@/app/(app)/history/page";
import SettingsPage from "@/app/(app)/settings/page";
import { saveMeal } from "@/app/(app)/log/actions";

const item = { name: "Rice", grams: 100, calories: 200, protein_g: 1, carbs_g: 1, fat_g: 1 };
const input = { id: crypto.randomUUID(), items: [item] };

describe("Today", () => {
  it("queries the 7-day window ending at the user's local today", async () => {
    state.calls = [];
    state.result = { data: [], error: null };
    await TodayPage();
    expect(state.calls).toContainEqual(["gte", "eaten_on", "2026-10-14"]);
    expect(state.calls).toContainEqual(["lte", "eaten_on", "2026-10-20"]);
  });

  it("throws to error.tsx when loading fails, not an empty week", async () => {
    state.result = { data: null, error: { code: "42501" } };
    await expect(TodayPage()).rejects.toThrow();
  });
});

describe("History", () => {
  it("caps the range at the user's local today", async () => {
    state.calls = [];
    state.result = { data: [], error: null };
    await HistoryPage();
    expect(state.calls).toContainEqual(["lte", "eaten_on", "2026-10-20"]);
  });
});

describe("Settings", () => {
  it("throws to error.tsx when targets fail to load, not a blank form", async () => {
    state.result = { data: null, error: { code: "42501" } };
    await expect(SettingsPage()).rejects.toThrow();
  });
});

describe("saveMeal", () => {
  it("returns the session-expired contract error without redirecting", async () => {
    state.claims = null;
    expect(await saveMeal(input)).toEqual({ error: "Your session expired. Sign in again.", sessionExpired: true });
    state.claims = { sub: "u1" };
  });

  it("uses the plan's copy for validation, 23514 and other errors", async () => {
    const range = "Some values are out of range. Check each item and try again.";
    expect(await saveMeal({ ...input, items: [{ ...item, calories: -1 }] })).toEqual({ error: range });
    state.result = { data: null, error: { code: "23514" } };
    expect(await saveMeal(input)).toEqual({ error: range });
    state.result = { data: null, error: { code: "XX000" } };
    expect(await saveMeal(input)).toEqual({ error: "Couldn't save your meal. Try again." });
  });
});
