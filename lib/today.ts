import { addDays } from "@/lib/dates";

export type Totals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
export type Targets = { calorie_target: number; protein_target_g: number; carbs_target_g: number; fat_target_g: number };
export type DayMeal = { id: string; initial: string; names: string; itemCount: number; kcal: number; time: string };
export type Day = { date: string; weekday: string; dayNumber: string; label: string; totals: Totals; goalMet: boolean; meals: DayMeal[] };

// Oldest to newest, ending on the user's local today.
export function lastSevenDays(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
}

// 0 = full ring, 1 = empty ring.
export function ringOffset(eaten: number, target: number): number {
  if (target <= 0) return eaten <= 0 ? 0 : 1;
  return 1 - Math.min(1, Math.max(0, eaten / target));
}

// Inclusive 90–110% of the target, compared on rounded calories.
export function goalMet(calories: number, calorieTarget: number | null): boolean {
  if (calorieTarget === null || calorieTarget <= 0) return false;
  const r = Math.round(calories);
  return r * 10 >= calorieTarget * 9 && r * 10 <= calorieTarget * 11;
}

export function initials(email: string): string {
  const parts = email.split("@")[0].split(/[._+-]+/).filter(Boolean);
  const out = parts.slice(0, 2).map((p) => [...p][0]).join("");
  return out.toUpperCase() || "?";
}
