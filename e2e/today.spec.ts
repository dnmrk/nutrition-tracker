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

test("a new user sees the empty state and a prompt to set targets", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText("No meals logged today.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Set your daily targets" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Snap meal" })).toHaveAttribute("href", "/log");
  await expect(page.getByText("0 kcal", { exact: true })).toBeVisible();
});

test("totals, remaining and progress come from the saved meals", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  for (const [label, v] of [["Calories", "2000"], ["Protein (g)", "150"], ["Carbs (g)", "200"], ["Fat (g)", "70"]]) {
    await page.getByLabel(label).fill(v);
  }
  await page.getByRole("button", { name: "Save targets" }).click();
  await expect(page.getByRole("status")).toHaveText("Targets saved.");

  await logMeal(page, [item("Rice", 72.4, 6.3, 0.4, 4.8)]);
  await logMeal(page, [item("Toast", 195, 4, 42, 0.4)]);

  await expect(page.getByText("267 / 2000 kcal")).toBeVisible();
  await expect(page.getByText("1733 kcal left")).toBeVisible();
  await expect(page.getByText("10 / 150 g")).toBeVisible();
  await expect(page.getByText("42 / 200 g")).toBeVisible();
  await expect(page.getByText("5 / 70 g")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Protein progress" })).toHaveAttribute("max", "150");
  await expect(page.getByText("Rice")).toBeVisible();
  await expect(page.getByText("Toast")).toBeVisible();
  await expect(page.getByText("No meals logged today.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Set your daily targets" })).toHaveCount(0);

  expect(await page.locator("button button, [role=button] [role=button], a a, a button, button a").count()).toBe(0);
});

test("kcal left agrees with the rounded eaten value", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  for (const [label, v] of [["Calories", "2000"], ["Protein (g)", "150"], ["Carbs (g)", "200"], ["Fat (g)", "70"]]) {
    await page.getByLabel(label).fill(v);
  }
  await page.getByRole("button", { name: "Save targets" }).click();
  await expect(page.getByRole("status")).toHaveText("Targets saved.");
  await logMeal(page, [item("Rice", 200.5, 1, 1, 1)]);
  await expect(page.getByText("201 / 2000 kcal")).toBeVisible();
  await expect(page.getByText("1799 kcal left")).toBeVisible();
});

test("no horizontal scroll at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signIn(page);
  await logMeal(page, [item("x".repeat(80), 200, 10, 20, 5)]);
  await expect(page.getByText("x".repeat(80))).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
