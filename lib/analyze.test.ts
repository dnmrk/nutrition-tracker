/* eslint-disable @typescript-eslint/no-explicit-any -- recorded request bodies are untyped */
import Groq from "groq-sdk";
import { describe, expect, it } from "vitest";
import { ANALYZE_MODEL, analyzeMeal, ERRORS } from "@/lib/analyze";

const payload = {
  items: [{ name: "Rice", grams: 150, calories: 200, protein_g: 4, carbs_g: 44, fat_g: 0.4 }],
  confidence: "high",
};
const completion = (content: string | null, finish_reason = "stop") => ({
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 0,
  model: "qwen/qwen3.8-27b",
  choices: [{ index: 0, message: { role: "assistant", content }, finish_reason, logprobs: null }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function run(respond: () => Response = () => json(completion(JSON.stringify(payload)))) {
  const requests: { body: any }[] = [];
  const fakeFetch = async (_url: unknown, init?: RequestInit) => {
    requests.push({ body: JSON.parse(String(init?.body)) });
    return respond();
  };
  const client = new Groq({ apiKey: "test", maxRetries: 0, fetch: fakeFetch as typeof fetch });
  return { requests, result: analyzeMeal(client, { data: "QUJD", mediaType: "image/jpeg" }) };
}
const content = (c: string | null, finish = "stop") => run(() => json(completion(c, finish))).result;
const http = (status: number, body: unknown = {}, headers = {}) => run(() => json(body, status, headers)).result;

describe("analyzeMeal request", () => {
  it("pins model, JSON mode, schema prompt and one data-URL image", async () => {
    const { requests, result } = run();
    expect(await result).toEqual({ ok: true, data: payload });
    const body = requests[0].body;
    expect(body.model).toBe(ANALYZE_MODEL);
    expect(body.model).toBe("qwen/qwen3.8-27b");
    expect(body.response_format.type).toBe("json_object");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain('"confidence"');
    const parts = body.messages[1].content.filter((p: any) => p.type === "image_url");
    expect(parts).toHaveLength(1);
    expect(parts[0].image_url.url.startsWith("data:image/jpeg;base64,")).toBe(true);
  });
});

describe("analyzeMeal validation", () => {
  it("lowercases confidence", async () => {
    const r = await content(JSON.stringify({ ...payload, confidence: "Low" }));
    expect(r).toMatchObject({ ok: true, data: { confidence: "low" } });
  });
  it.each([
    ["out-of-range calories", JSON.stringify({ ...payload, items: [{ ...payload.items[0], calories: 20000 }] }), "stop"],
    ["non-JSON", "not json", "stop"],
    ["truncated", JSON.stringify(payload), "length"],
    ["null content", null, "stop"],
  ])("502 on %s", async (_n, c, finish) => {
    expect(await content(c, finish)).toEqual({ ok: false, status: 502, error: ERRORS.upstream });
  });
});

describe("analyzeMeal errors", () => {
  it("429 busy", async () => {
    expect(await http(429, {}, { "retry-after": "7" })).toEqual({ ok: false, status: 429, error: ERRORS.busy });
  });
  it("429 daily", async () => {
    expect(await http(429, {}, { "retry-after": "3600" })).toEqual({ ok: false, status: 429, error: ERRORS.daily });
  });
  it("413", async () => {
    expect(await http(413)).toEqual({ ok: false, status: 413, error: ERRORS.tooLarge });
  });
  it("400 json_validate_failed -> 502", async () => {
    const r = await http(400, { error: { code: "json_validate_failed", message: "x" } });
    expect(r).toEqual({ ok: false, status: 502, error: ERRORS.upstream });
  });
  it("other 400 -> 422", async () => {
    expect(await http(400, { error: { message: "bad image" } })).toEqual({ ok: false, status: 422, error: ERRORS.unreadable });
  });
  it("404 -> 502", async () => {
    expect(await http(404)).toMatchObject({ ok: false, status: 502 });
  });
  it("500 -> 502", async () => {
    expect(await http(500)).toMatchObject({ ok: false, status: 502 });
  });
  it("200 with a non-completion body -> 502", async () => {
    expect(await run(() => new Response("<html>", { status: 200 })).result).toMatchObject({ ok: false, status: 502 });
    expect(await run(() => json({})).result).toMatchObject({ ok: false, status: 502 });
  });
});
