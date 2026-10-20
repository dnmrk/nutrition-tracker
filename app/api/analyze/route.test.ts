import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims } }) }));
const analyzeMeal = vi.fn();
vi.mock("@/lib/analyze", async (orig) => ({
  ...(await orig<typeof import("@/lib/analyze")>()),
  getGroq: () => ({}),
  analyzeMeal: (...a: unknown[]) => analyzeMeal(...a),
}));

import { POST } from "./route";

const post = (body: BodyInit, headers?: HeadersInit) =>
  POST(new Request("http://localhost/api/analyze", { method: "POST", body, headers }));
const form = (file?: File) => {
  const f = new FormData();
  if (file) f.set("image", file);
  return f;
};
const jpeg = (n = 10) => new File([new Uint8Array(n)], "a.jpg", { type: "image/jpeg" });

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: "u" } } });
});

describe("POST /api/analyze", () => {
  it("401 without claims", async () => {
    getClaims.mockResolvedValue({ data: null });
    const res = await post(form(jpeg()));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in again to analyze photos." });
  });
  it("400 for a JSON body", async () => {
    const res = await post(JSON.stringify({ a: 1 }), { "content-type": "application/json" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Choose a photo to analyze." });
  });
  it("400 when the field is missing", async () => {
    expect((await post(form())).status).toBe(400);
  });
  it("415 for text/plain", async () => {
    const res = await post(form(new File(["x"], "a.txt", { type: "text/plain" })));
    expect(res.status).toBe(415);
  });
  it("400 for an empty file", async () => {
    expect((await post(form(jpeg(0)))).status).toBe(400);
  });
  it("413 for an oversize file", async () => {
    const res = await post(form(jpeg(1_500_001)));
    expect(res.status).toBe(413);
    expect(analyzeMeal).not.toHaveBeenCalled();
  });
  it("413 on a huge content-length", async () => {
    expect((await post(form(jpeg()), { "content-length": "1700001" })).status).toBe(413);
  });
  it("200 passthrough", async () => {
    const data = { items: [], confidence: "low" };
    analyzeMeal.mockResolvedValue({ ok: true, data });
    const res = await post(form(jpeg()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(data);
    expect(analyzeMeal.mock.calls[0][1].mediaType).toBe("image/jpeg");
  });
  it("429 passthrough", async () => {
    analyzeMeal.mockResolvedValue({ ok: false, status: 429, error: "busy" });
    const res = await post(form(jpeg()));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "busy" });
  });
});
