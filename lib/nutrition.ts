import { z } from "zod";

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
  name: z.string().min(1).max(NAME_MAX).refine((s) => s.trim().length > 0),
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

const target = (k: keyof typeof TARGET_LIMITS) =>
  z.coerce.number().int().min(TARGET_LIMITS[k][0]).max(TARGET_LIMITS[k][1]);

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
