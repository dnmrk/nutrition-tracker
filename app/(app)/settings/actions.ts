"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { TARGET_LIMITS, TargetsSchema } from "@/lib/nutrition";

// `values` echoes what was submitted so the form can keep it (React resets uncontrolled inputs after every action).
export type TargetsState =
  | ({ values: Record<string, string> } & ({ ok: true } | { error: string }))
  | null;

export async function saveTargets(
  _prev: TargetsState,
  formData: FormData,
): Promise<TargetsState> {
  const { supabase, userId } = await requireUser();
  const values = Object.fromEntries(
    Object.keys(TARGET_LIMITS).map((k) => [k, String(formData.get(k) ?? "")]),
  );

  const parsed = TargetsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { values, error: "Some values are out of range." };

  const { error } = await supabase
    .from("daily_targets")
    .upsert({ user_id: userId, ...parsed.data });
  if (error) return { values, error: "Couldn't save targets. Try again." };

  revalidatePath("/");
  revalidatePath("/settings"); // keeps the form's reset defaults current
  return { values, ok: true };
}
