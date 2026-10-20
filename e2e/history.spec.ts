import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";

const item = (name: string, calories: number, protein_g: number, carbs_g: number, fat_g: number) => ({
  name,
  grams: 100,
  calories,
  protein_g,
  carbs_g,
  fat_g,
});

async function logMeal(page: Page, items: ReturnType<typeof item>[]) {
  await page.route("**/api/analyze", (route) => route.fulfill({ json: { items, confidence: "high" } }), { times: 1 });
  await page.goto("/log");
  await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/meal.jpg");
  await page.getByRole("button", { name: "Log meal" }).click();
  await page.waitForURL("/");
}

const EMPTY = "No meals in the last 30 days.";

test("a new user sees the empty state", async ({ page }) => {
  await signIn(page);
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.getByText(EMPTY)).toBeVisible();
});

test("meals group by day with totals, and another user sees none of them", async ({ page, browser }) => {
  await signIn(page);
  await logMeal(page, [item("Rice", 72.4, 6.3, 0.4, 4.8)]);
  await logMeal(page, [item("Toast", 195, 4, 42, 0.4)]);
  await page.goto("/history");

  const sections = page.locator("main section");
  await expect(sections).toHaveCount(1);
  await expect(sections.first().getByRole("heading", { level: 2 })).toHaveText(
    new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Manila" }).format(new Date()),
  );
  await expect(sections.first().getByText("267 kcal · P 10 g · C 42 g · F 5 g")).toBeVisible();
  await expect(sections.first().getByText("Rice")).toBeVisible();
  await expect(sections.first().getByText("Toast")).toBeVisible();
  expect(await page.locator("button button, [role=button] [role=button], a a, a button, button a").count()).toBe(0);

  const other = await browser.newPage({ timezoneId: "Asia/Manila", baseURL: "http://127.0.0.1:3000" });
  await signIn(other);
  await other.goto("/history");
  await expect(other.getByText(EMPTY)).toBeVisible();
  await expect(other.getByText("Rice")).toHaveCount(0);
  await other.close();
});

test("no horizontal scroll at 320px with a long meal name", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signIn(page);
  await logMeal(page, [item("x".repeat(80), 200, 10, 20, 5)]);
  await page.goto("/history");
  await expect(page.getByText("x".repeat(80))).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
