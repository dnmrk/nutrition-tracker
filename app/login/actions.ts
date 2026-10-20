"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { ok: true } | { error: string } | null;

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = z.email().max(254).safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { shouldCreateUser: true },
  });
  if (error) return { error: "Couldn't send the link. Try again in a minute." };
  return { ok: true };
}
