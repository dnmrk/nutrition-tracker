import { expect, test, type Page, type Route } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { session } from "./helpers/meals";

const PHOTO = "e2e/fixtures/meal.jpg";
const item = (name: string, calories: number) => ({ name, grams: 100, calories, protein_g: 10, carbs_g: 20, fat_g: 5 });
const analysis = (items: ReturnType<typeof item>[], confidence = "high") => ({ items, confidence });
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body });

async function mockAnalyze(page: Page, body: unknown, status = 200) {
  await page.route("**/api/analyze", (route) => json(route, body, status));
}

async function pick(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
}

// Reads the signed-in user's meals over PostgREST (RLS scopes them) using the session cookie.
async function userMeals(page: Page): Promise<{ id: string; items: { calories: number }[] }[]> {
  const { access_token } = await session(page);
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/meals?select=id,items`, {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      authorization: `Bearer ${access_token}`,
    },
  });
  return res.json();
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await page.goto("/log");
});

test("happy path: snap, edit, live total, save", async ({ page }) => {
  await mockAnalyze(page, analysis([item("Rice", 200), item("Egg", 80)]));
  await pick(page);
  await expect(page.getByText("Total: 280 kcal")).toBeVisible();
  await page.getByLabel("Calories").first().fill("300");
  await expect(page.getByText("Total: 380 kcal")).toBeVisible();
  await page.getByRole("button", { name: "Log meal" }).click();
  await page.waitForURL("/");
  await expect(page.getByText("2 items · 380 kcal")).toBeVisible();
  const meals = await userMeals(page);
  expect(meals).toHaveLength(1);
  expect(meals[0].items.map((i) => i.calories)).toEqual([300, 80]);
});

test("low confidence shows the rough-estimate banner and the disclaimer", async ({ page }) => {
  await mockAnalyze(page, analysis([item("Soup", 150)], "low"));
  await pick(page);
  await expect(page.getByText("Rough estimate — tap any item to adjust.")).toBeVisible();
  await expect(page.getByText("Estimates from a photo, not medical advice. Check and edit before saving.")).toBeVisible();
});

test("empty analysis shows the no-food copy", async ({ page }) => {
  await mockAnalyze(page, analysis([], "low"));
  await pick(page);
  await expect(page.getByText("No food detected. Add items manually.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log meal" })).toBeDisabled();
});

test("502 shows the alert; enter manually then save", async ({ page }) => {
  await mockAnalyze(page, { error: "Couldn't analyze the photo. Try again or enter the meal manually." }, 502);
  await pick(page);
  await expect(page.locator("main").getByRole("alert")).toHaveText("Couldn't analyze the photo. Try again or enter the meal manually.");
  await page.getByRole("button", { name: "Enter manually" }).click();
  await page.getByLabel("Food").fill("Toast");
  await page.getByLabel("Grams").fill("50");
  await page.getByLabel("Calories").fill("120");
  await page.getByLabel("Protein (g)").fill("4");
  await page.getByLabel("Carbs (g)").fill("22");
  await page.getByLabel("Fat (g)").fill("1");
  await page.getByRole("button", { name: "Log meal" }).click();
  await page.waitForURL("/");
  expect(await userMeals(page)).toHaveLength(1);
});

test("Try again re-posts after an error", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/analyze", (route) =>
    ++calls === 1 ? json(route, { error: "Photo analysis is busy. Wait a minute and try again." }, 429) : json(route, analysis([item("Pear", 90)])),
  );
  await pick(page);
  await expect(page.locator("main").getByRole("alert")).toHaveText("Photo analysis is busy. Wait a minute and try again.");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Total: 90 kcal")).toBeVisible();
});

test("a lost save response retries without a duplicate row", async ({ page }) => {
  await mockAnalyze(page, analysis([item("Rice", 200)]));
  await pick(page);
  let aborted = false;
  await page.route("**/log", async (route) => {
    if (!aborted && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      aborted = true;
      await route.fetch(); // the server saves, the client never hears
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Log meal" }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Log meal" }).click();
  await page.waitForURL("/");
  expect(await userMeals(page)).toHaveLength(1);
});

test("a stale analysis never overwrites a newer pick", async ({ page }) => {
  const held: Route[] = [];
  let n = 0;
  await page.route("**/api/analyze", (route) => {
    held[n++] = route;
  });
  await pick(page);
  await expect.poll(() => held.length).toBe(1);
  await pick(page);
  await expect.poll(() => held.length).toBe(2);
  await json(held[1], analysis([item("B", 20)]));
  await expect(page.getByLabel("Food")).toHaveValue("B");
  await json(held[0], analysis([item("A", 10)])).catch(() => {}); // aborted client-side
  await expect(page.getByLabel("Food")).toHaveValue("B");
  await expect(page.getByLabel("Food")).toHaveCount(1);
});

test("an expired session on save keeps the draft and offers sign-in", async ({ page }) => {
  await mockAnalyze(page, analysis([item("Rice", 200)]));
  await pick(page);
  await page.getByLabel("Food").fill("Edited rice");
  await page.context().clearCookies({ name: /^sb-/ });
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Log meal" }).click();
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toContainText("Your session expired. Sign in again.");
    await expect(alert.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  }
  await expect(page).toHaveURL(/\/log$/);
  await expect(page.getByLabel("Food")).toHaveValue("Edited rice");
});

test("out-of-range values posted around the client show the inline error", async ({ page }) => {
  await mockAnalyze(page, analysis([item("Rice", 200)]));
  await pick(page);
  await page.getByLabel("Calories").fill("20000");
  await page.evaluate(() =>
    document.querySelectorAll("input").forEach((i) => {
      i.removeAttribute("min");
      i.removeAttribute("max");
    }),
  );
  await page.getByRole("button", { name: "Log meal" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Some values are out of range. Check each item and try again.");
  expect(await userMeals(page)).toHaveLength(0);
});

test("no nested interactive elements", async ({ page }) => {
  await mockAnalyze(page, analysis([item("Rice", 200)]));
  await pick(page);
  await expect(page.getByLabel("Food")).toBeVisible();
  expect(await page.locator("button button, [role=button] [role=button]").count()).toBe(0);
});

test("no horizontal scroll at 320px with a long name", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockAnalyze(page, analysis([item("x".repeat(80), 200)], "low"));
  await pick(page);
  await expect(page.getByLabel("Food")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("a hung analysis times out into the error state", async ({ page }) => {
  await page.clock.install();
  let hit = false;
  await page.route("**/api/analyze", () => {
    hit = true; // never responds
  });
  await pick(page);
  await expect.poll(() => hit).toBe(true); // the client timer is armed before the fetch
  await page.clock.fastForward(60_000);
  await expect(page.locator("main").getByRole("alert")).toHaveText("Photo analysis timed out. Try again or enter the meal manually.");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter manually" })).toBeVisible();
});

test("Cancel leaves the analyzing state; a late response is ignored", async ({ page }) => {
  let held: Route | undefined;
  await page.route("**/api/analyze", (route) => {
    held = route;
  });
  await pick(page);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Analysis cancelled.");
  await held?.fulfill({ json: analysis([item("Late", 10)]) }).catch(() => {});
  await expect(page.getByLabel("Food")).toHaveCount(0);
  await page.getByRole("button", { name: "Enter manually" }).click();
  await expect(page.getByLabel("Food")).toHaveValue("");
});

test("a non-image file gets an accurate message, not the too-large copy", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({ name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.locator("main").getByRole("alert")).toHaveText("We couldn't read that photo. Use a JPEG, PNG or WebP photo.");
});
