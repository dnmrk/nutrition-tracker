import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AnalysisSchema,
  MealItemSchema,
  SaveMealSchema,
  TargetsSchema,
  fmt,
  groupByDay,
  sumItems,
} from "./nutrition";

const item = (o: Record<string, unknown> = {}) => ({
  name: "Egg",
  grams: 50,
  calories: 72.4,
  protein_g: 6.3,
  carbs_g: 0.4,
  fat_g: 4.8,
  ...o,
});
const rice = item({ name: "Rice", calories: 195, protein_g: 4, carbs_g: 42, fat_g: 0.4 });

describe("sumItems / fmt", () => {
  it("sums decimals across items", () => {
    const t = sumItems([item(), rice]);
    expect(t.calories).toBeCloseTo(267.4);
    expect(t.protein_g).toBeCloseTo(10.3);
    expect(t.carbs_g).toBeCloseTo(42.4);
    expect(t.fat_g).toBeCloseTo(5.2);
  });
  it("returns zeros for empty", () => {
    expect(sumItems([])).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });
  it("rounds half up", () => expect(fmt(0.5)).toBe("1"));
});

describe("MealItemSchema", () => {
  it("accepts boundaries", () => {
    expect(
      MealItemSchema.safeParse(item({ name: "x".repeat(80), grams: 5000, calories: 10000 })).success,
    ).toBe(true);
  });
  it.each([
    ["over max", { grams: 5000.01 }],
    ["negative", { calories: -1 }],
    ["blank name", { name: "   " }],
    ["long name", { name: "x".repeat(81) }],
    ["null grams", { grams: null }],
    ["missing fat_g", { fat_g: undefined }],
    ["NUL in name", { name: "a\u0000b" }],
    ["81 code points", { name: "x".repeat(81) }],
    ["81 emoji", { name: "😀".repeat(81) }],
  ])("rejects %s", (_, o) => {
    expect(MealItemSchema.safeParse(item(o)).success).toBe(false);
  });
});

describe("MealItemSchema name semantics (match SQL char_length(btrim))", () => {
  it("counts code points and ignores padding spaces", () => {
    expect(MealItemSchema.safeParse(item({ name: "😀".repeat(80) })).success).toBe(true);
    expect(MealItemSchema.safeParse(item({ name: " ".repeat(10) + "x".repeat(80) })).success).toBe(true);
  });
});

describe("SaveMealSchema", () => {
  const id = "0b4b7542-629b-405d-b41e-06b0ac73cb78";
  it("rejects 0 and 31 items, accepts 1", () => {
    expect(SaveMealSchema.safeParse({ id, items: [] }).success).toBe(false);
    expect(SaveMealSchema.safeParse({ id, items: Array(31).fill(item()) }).success).toBe(false);
    expect(SaveMealSchema.safeParse({ id, items: [item()] }).success).toBe(true);
  });
});

describe("TargetsSchema", () => {
  const ok = { calorie_target: "2000", protein_target_g: "100", carbs_target_g: "200", fat_target_g: "60" };
  it("accepts the upper bound", () => {
    expect(TargetsSchema.safeParse({ ...ok, calorie_target: "10000" }).success).toBe(true);
  });
  it.each([
    { calorie_target: "0" },
    { protein_target_g: "1001" },
    { fat_target_g: "12.5" },
    { protein_target_g: "" },
    { carbs_target_g: " " },
    { fat_target_g: null },
    { protein_target_g: "1e3" },
    { carbs_target_g: "-0" },
  ])("rejects %j", (o) => {
    expect(TargetsSchema.safeParse({ ...ok, ...o }).success).toBe(false);
  });
});

describe("AnalysisSchema", () => {
  it("converts to JSON schema", () => {
    expect(() => z.toJSONSchema(AnalysisSchema)).not.toThrow();
  });
  it("emits name bounds for the model", () => {
    const j = z.toJSONSchema(AnalysisSchema) as unknown as {
      properties: { items: { items: { properties: { name: object } } } };
    };
    expect(j.properties.items.items.properties.name).toMatchObject({ minLength: 1, maxLength: 80 });
  });
});

describe("groupByDay", () => {
  it("groups by date keeping order, with totals", () => {
    const m = (eaten_on: string, items: ReturnType<typeof item>[]) => ({ eaten_on, items: items as never });
    const g = groupByDay([m("2026-10-20", [item()]), m("2026-10-20", [rice]), m("2026-10-19", [rice])]);
    expect(g.map((d) => [d.date, d.meals.length])).toEqual([["2026-10-20", 2], ["2026-10-19", 1]]);
    expect(g[0].totals.calories).toBeCloseTo(267.4);
    expect(g[1].totals.calories).toBe(195);
  });
});
