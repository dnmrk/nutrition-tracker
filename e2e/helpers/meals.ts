import { expect, type Page } from "@playwright/test";

type Item = { name: string; grams: number; calories: number; protein_g: number; carbs_g: number; fat_g: number };

// The signed-in user's Supabase session, parsed from the auth cookie(s).
export async function session(page: Page): Promise<{ access_token: string; user: { id: string } }> {
  const cookies = (await page.context().cookies()).filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));
  const raw = cookies.sort((a, b) => a.name.localeCompare(b.name)).map((c) => decodeURIComponent(c.value)).join("");
  return JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString());
}

// Inserts a meal on a given local date over PostgREST with the user's JWT (RLS scopes it).
export async function insertMeal(page: Page, eaten_on: string, items: Item[]) {
  const s = await session(page);
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/meals`, {
    method: "POST",
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      authorization: `Bearer ${s.access_token}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ id: crypto.randomUUID(), user_id: s.user.id, eaten_on, items }),
  });
  expect(res.status).toBe(201);
}
