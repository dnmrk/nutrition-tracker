"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getToday } from "@/lib/supabase/server";
import { SaveMealSchema, type MealItem } from "@/lib/nutrition";

const OUT_OF_RANGE = "Some values are out of range. Check each item and try again.";
const SAVE_FAILED = "Couldn't save your meal. Try again.";
const SESSION_EXPIRED = "Your session expired. Sign in again.";

export async function saveMeal(input: { id: string; items: MealItem[] }): Promise<{ error: string; sessionExpired?: true }> {
  // Not requireUser(): its redirect would be swallowed by the client form and lose the draft.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: SESSION_EXPIRED, sessionExpired: true };
  const userId = data.claims.sub;

  const parsed = SaveMealSchema.safeParse(input);
  if (!parsed.success) return { error: OUT_OF_RANGE };

  const { error } = await supabase
    .from("meals")
    .insert({ id: parsed.data.id, user_id: userId, eaten_on: (await getToday()).date, items: parsed.data.items });
  // 23505: a retry of a save whose response was lost; the meal already exists.
  if (error && error.code !== "23505") {
    return { error: error.code === "23514" ? OUT_OF_RANGE : SAVE_FAILED };
  }

  revalidatePath("/");
  revalidatePath("/history");
  redirect("/");
}
