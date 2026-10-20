import { z } from "zod";
import { type Day, goalMet, lastSevenDays } from "./today";

// Limits mirror supabase/migrations/20261020000000_nutrition_mvp.sql.
export const MAX_IMAGE_BYTES = 1_500_000;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_ITEMS = 30;
export const NAME_MAX = 80;
export const ITEM_MAX = { grams: 5000, calories: 10000, protein_g: 1000, carbs_g: 1000, fat_g: 1000 } as const;
export const TARGET_LIMITS = {
  calorie_target: [1, 10000],
  protein_target_g: [0, 1000],
  carbs_target_g: [0, 1000],
  fat_target_g: [0, 1000],
} as const;

const num = (k: keyof typeof ITEM_MAX) => z.number().min(0).max(ITEM_MAX[k]);

export const MealItemSchema = z.object({
  // SQL: char_length(btrim(name)) between 1 and 80 (code points, spaces trimmed); NUL breaks the jsonb cast.
  // Stricter than SQL on non-space whitespace (JS trim).
  name: z
    .string()
    .refine((s) => !s.includes("\0"))
    .refine((s) => s.trim().length > 0)
    .refine((s) => [...s.replace(/^ +| +$/g, "")].length <= NAME_MAX)
    // Bounds for z.toJSONSchema only; a real .max() would count UTF-16 units at runtime.
    .meta({ minLength: 1, maxLength: NAME_MAX }),
  grams: num("grams"),
  calories: num("calories"),
  protein_g: num("protein_g"),
  carbs_g: num("carbs_g"),
  fat_g: num("fat_g"),
});
export type MealItem = z.infer<typeof MealItemSchema>;

export const AnalysisSchema = z.object({
  items: z.array(MealItemSchema).max(MAX_ITEMS),
  confidence: z.enum(["high", "medium", "low"]),
});

export const SaveMealSchema = z.object({
  id: z.uuid(),
  items: z.array(MealItemSchema).min(1).max(MAX_ITEMS),
});

// Digits only: z.coerce alone turns "", " " and null into 0.
const target = (k: keyof typeof TARGET_LIMITS) =>
  z
    .unknown()
    .refine((v) => /^\d+$/.test(String(v)))
    .pipe(z.coerce.number())
    .pipe(z.number().int().min(TARGET_LIMITS[k][0]).max(TARGET_LIMITS[k][1]));

export const TargetsSchema = z.object({
  calorie_target: target("calorie_target"),
  protein_target_g: target("protein_target_g"),
  carbs_target_g: target("carbs_target_g"),
  fat_target_g: target("fat_target_g"),
});

export function sumItems(items: MealItem[]) {
  const t = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const i of items) {
    t.calories += i.calories;
    t.protein_g += i.protein_g;
    t.carbs_g += i.carbs_g;
    t.fat_g += i.fat_g;
  }
  return t;
}

export const fmt = (n: number) => String(Math.round(n));

export function groupByDay<T extends { eaten_on: string; items: MealItem[] }>(meals: T[]) {
  const days = new Map<string, T[]>();
  for (const m of meals) days.set(m.eaten_on, [...(days.get(m.eaten_on) ?? []), m]);
  return [...days].map(([date, ms]) => ({
    date,
    meals: ms,
    totals: sumItems(ms.flatMap((m) => m.items)),
  }));
}

// Server-only: formats with Intl, so the browser never sees raw rows or ICU output.
export function buildWeek(
  rows: { id: string; eaten_on: string; logged_at: string; items: MealItem[] }[],
  today: string,
  timeZone: string,
  calorieTarget: number | null,
): Day[] {
  const byDate = new Map(groupByDay(rows).map((d) => [d.date, d]));
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "narrow", timeZone: "UTC" });
  const dayNumber = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" });
  const longDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const clock = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });

  return lastSevenDays(today).map((date) => {
    const at = new Date(`${date}T00:00:00Z`);
    const group = byDate.get(date);
    const totals = group?.totals ?? { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    const met = goalMet(totals.calories, calorieTarget);
    return {
      date,
      weekday: weekday.format(at),
      dayNumber: dayNumber.format(at),
      label: `${longDate.format(at)}${met ? ", goal met" : ""}`,
      totals,
      goalMet: met,
      meals: (group?.meals ?? []).map((m) => ({
        id: m.id,
        // Guard: a meal with no items must not crash the page.
        initial: ([...(m.items[0]?.name.trim() ?? "")][0] ?? "?").toUpperCase(),
        names: m.items.map((i) => i.name).join(", "),
        itemCount: m.items.length,
        kcal: Math.round(sumItems(m.items).calories),
        time: clock.format(new Date(m.logged_at)),
      })),
    };
  });
}
