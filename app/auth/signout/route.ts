import { createClient } from "@/lib/supabase/server";
import { redirectTo } from "@/lib/redirect";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirectTo("/login", 303);
}
