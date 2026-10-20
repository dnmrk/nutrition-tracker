import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const claims = vi.hoisted(() => ({ value: null as object | null }));
const auth = {
  getClaims: async () => ({ data: claims.value ? { claims: claims.value } : null }),
  verifyOtp: async () => ({ error: new Error("bad") }),
  signOut: async () => ({ error: null }),
};
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));

import { proxy } from "@/proxy";
import { GET as confirm } from "@/app/auth/confirm/route";
import { POST as signout } from "@/app/auth/signout/route";

const hosts = ["evil.com", "user@evil.com", "["];
const req = (path: string, host: string, method = "GET") =>
  new NextRequest(`http://app.test:3000${path}`, { method, headers: { host } });

// Location must never carry an origin, whatever Host says.
const expectRelative = (res: Response, status: number, to: string) => {
  expect(res.status).toBe(status);
  expect(res.headers.get("location")).toBe(to);
};
// The proxy's NextResponse.redirect is absolute here (Next makes it relative at runtime):
// it must come from request.url, never from Host.
const expectSameOrigin = (res: Response, to: string) => {
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toBe(`http://app.test:3000${to}`);
};

describe("proxy and Server Actions", () => {
  it("lets an anonymous Server Action POST through so it can return its own session error", async () => {
    claims.value = null;
    const res = await proxy(new NextRequest("http://app.test:3000/log", { method: "POST", headers: { "next-action": "abc" } }));
    expect(res.status).toBe(200);
  });
});

describe.each(hosts)("Host: %s", (host) => {
  it("proxy redirects anonymous users to the request origin", async () => {
    claims.value = null;
    expectSameOrigin(await proxy(req("/", host)), "/login");
  });
  it("proxy redirects signed-in users off /login to the request origin", async () => {
    claims.value = { sub: "u" };
    expectSameOrigin(await proxy(req("/login", host)), "/");
  });
  it("/auth/confirm redirects relatively", async () => {
    expectRelative(
      await confirm(req("/auth/confirm?token_hash=x&type=email", host)),
      307,
      "/login?error=link",
    );
  });
  it("/auth/signout redirects relatively", async () => {
    expectRelative(await signout(), 303, "/login");
  });
});
