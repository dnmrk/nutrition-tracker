import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { redirectTo } from "@/lib/redirect";

// No `next` parameter on purpose: the destination is fixed (no open redirect).
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (tokenHash && type === "email") {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: "email",
      token_hash: tokenHash,
    });
    if (!error) return redirectTo("/");
  }
  return redirectTo("/login?error=link");
}
