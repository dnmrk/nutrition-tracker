import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { localDate, resolveTimeZone, TZ_COOKIE } from "@/lib/dates";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component: the proxy refreshes the session.
          }
        },
      },
    },
  );
}

export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return { supabase, userId: data.claims.sub };
}

export async function getToday() {
  const raw = (await cookies()).get(TZ_COOKIE)?.value;
  const timeZone = resolveTimeZone(raw);
  return { timeZone, date: localDate(timeZone) };
}
