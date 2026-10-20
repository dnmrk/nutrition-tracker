"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getToday, requireUser } from "@/lib/supabase/server";
import { SaveMealSchema, type MealItem } from "@/lib/nutrition";

const OUT_OF_RANGE = "Some values are out of range.";

export async function saveMeal(input: { id: string; items: MealItem[] }): Promise<{ error: string }> {
  const { supabase, userId } = await requireUser();

  const parsed = SaveMealSchema.safeParse(input);
  if (!parsed.success) return { error: OUT_OF_RANGE };

  const { error } = await supabase
    .from("meals")
    .insert({ id: parsed.data.id, user_id: userId, eaten_on: (await getToday()).date, items: parsed.data.items });
  // 23505: a retry of a save whose response was lost; the meal already exists.
  if (error && error.code !== "23505") {
    return { error: error.code === "23514" ? OUT_OF_RANGE : "Couldn't save the meal. Try again." };
  }

  revalidatePath("/");
  revalidatePath("/history");
  redirect("/");
}
