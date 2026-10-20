import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let refreshed: { name: string; value: string; options?: object }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          refreshed = cookiesToSet;
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const redirectTo = (to: string) => {
    const res = NextResponse.redirect(new URL(to, request.url));
    // Keep refreshed session cookies and cache headers on the redirect.
    refreshed.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options),
    );
    response.headers.forEach((v, k) => {
      if (k === "cache-control" || k === "expires" || k === "pragma")
        res.headers.set(k, v);
    });
    return res;
  };

  if (
    !data?.claims &&
    path !== "/login" &&
    !path.startsWith("/auth/") &&
    !path.startsWith("/api/")
  ) {
    return redirectTo("/login");
  }
  if (data?.claims && path === "/login") return redirectTo("/");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
