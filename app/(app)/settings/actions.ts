"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { TargetsSchema } from "@/lib/nutrition";

export type TargetsState = { ok: true } | { error: string } | null;

export async function saveTargets(
  _prev: TargetsState,
  formData: FormData,
): Promise<TargetsState> {
  const { supabase, userId } = await requireUser();

  const parsed = TargetsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Some values are out of range." };

  const { error } = await supabase
    .from("daily_targets")
    .upsert({ user_id: userId, ...parsed.data });
  if (error) return { error: "Couldn't save targets. Try again." };

  revalidatePath("/");
  revalidatePath("/settings"); // keeps the form's reset defaults current
  return { ok: true };
}
