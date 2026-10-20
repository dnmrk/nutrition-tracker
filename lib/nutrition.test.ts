import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AnalysisSchema,
  MealItemSchema,
  SaveMealSchema,
  TargetsSchema,
  buildWeek,
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

describe("buildWeek", () => {
  const m1 = {
    id: "m1",
    eaten_on: "2026-10-20",
    logged_at: "2026-10-19T23:30:00Z",
    items: [
      item({ name: "Rice", calories: 72.4, protein_g: 6.3, carbs_g: 0.4, fat_g: 4.8 }),
      item({ name: "Toast", calories: 195, protein_g: 4, carbs_g: 42, fat_g: 0.4 }),
    ],
  };
  const m2 = {
    id: "m2",
    eaten_on: "2026-10-18",
    logged_at: "2026-10-18T04:05:00Z",
    items: [item({ name: " oats", calories: 1900, protein_g: 0, carbs_g: 0, fat_g: 0 })],
  };
  const week = buildWeek([m1, m2], "2026-10-20", "Asia/Manila", 2000);

  it("always returns seven days, oldest to newest, ending on today", () => {
    expect(week).toHaveLength(7);
    expect(week[0].date).toBe("2026-10-14");
    expect(week[6].date).toBe("2026-10-20");
  });

  it("labels today's calendar date without tz drift", () => {
    expect(week[6].weekday).toBe("T");
    expect(week[6].dayNumber).toBe("20");
    expect(week[6].label).toBe("Tuesday, October 20, 2026");
  });

  it("shapes today's meal rows in the user's zone", () => {
    const meal = week[6].meals[0];
    expect(week[6].meals).toHaveLength(1);
    expect(meal.names).toBe("Rice, Toast");
    expect(meal.itemCount).toBe(2);
    expect(meal.kcal).toBe(267);
    expect(meal.initial).toBe("R");
    expect(meal.time).toMatch(/^7:30\sAM$/);
  });

  it("rounds day totals and marks goal-met only inside 90-110%", () => {
    expect(week[6].totals.calories).toBeCloseTo(267.4);
    expect(week[6].totals.protein_g).toBeCloseTo(10.3);
    expect(week[6].totals.carbs_g).toBeCloseTo(42.4);
    expect(week[6].totals.fat_g).toBeCloseTo(5.2);
    expect(week[6].goalMet).toBe(false);
    expect(week[4].goalMet).toBe(true);
  });

  it("labels a goal-met day and trims the initial", () => {
    expect(week[4].label).toBe("Sunday, October 18, 2026, goal met");
    expect(week[4].meals[0].initial).toBe("O");
    expect(week[4].meals[0].names).toBe(" oats");
  });

  it("gives empty days zero totals and no meals", () => {
    expect(week[0].totals).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    expect(week[0].meals).toEqual([]);
    expect(week[0].goalMet).toBe(false);
  });

  it("never marks goal met without a calorie target", () => {
    expect(buildWeek([m2], "2026-10-20", "Asia/Manila", null)[4].goalMet).toBe(false);
  });
});
