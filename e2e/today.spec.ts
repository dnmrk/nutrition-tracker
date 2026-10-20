import { expect, test, type Page } from "@playwright/test";
import { addDays, localDate } from "../lib/dates";
import { initials } from "../lib/today";
import { signIn } from "./helpers/auth";
import { insertMeal } from "./helpers/meals";

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

async function setTargets(page: Page, [calories, protein, carbs, fat]: string[]) {
  await page.goto("/settings");
  for (const [label, v] of [["Calories", calories], ["Protein (g)", protein], ["Carbs (g)", carbs], ["Fat (g)", fat]]) {
    await page.getByLabel(label).fill(v);
  }
  await page.getByRole("button", { name: "Save targets" }).click();
  await expect(page.getByRole("status")).toHaveText("Targets saved.");
}

const today = localDate("Asia/Manila");
const longDate = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const label = (d: string) => longDate.format(new Date(`${d}T00:00:00Z`));
const strip = (page: Page) => page.getByRole("group", { name: "Last 7 days" });
const dayButton = (page: Page, d: string, suffix = "") => strip(page).getByRole("button", { name: `${label(d)}${suffix}` });
const highlight = (page: Page) => strip(page).locator("[aria-hidden]");
const EMPTY = "No meals logged on this day.";

test("Empty state (new user)", async ({ page }) => {
  const email = await signIn(page);
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCSS("font-size", "32px");
  await expect(page.locator("h1")).toHaveCSS("font-weight", "700");
  const brand = page.getByText("NutritionTracker", { exact: true });
  await expect(brand).toBeVisible();
  expect((await brand.boundingBox())!.y).toBeLessThan((await page.locator("h1").boundingBox())!.y);

  const avatar = page.getByRole("img", { name: `Signed in as ${email}` });
  await expect(avatar).toHaveText(initials(email));
  await expect(avatar).not.toHaveAttribute("tabindex", /.*/);

  const buttons = strip(page).getByRole("button");
  await expect(buttons).toHaveCount(7);
  await expect(buttons.last()).toHaveAccessibleName(label(today));
  await expect(buttons.last()).toHaveAttribute("aria-pressed", "true");
  await expect(buttons.last()).toHaveAttribute("tabindex", "0");
  for (let i = 0; i < 6; i++) {
    await expect(buttons.nth(i)).toHaveAttribute("aria-pressed", "false");
    await expect(buttons.nth(i)).toHaveAttribute("tabindex", "-1");
  }
  await expect(buttons.first()).toHaveAccessibleName(label(addDays(today, -6)));

  await expect(page.getByText(EMPTY)).toBeVisible();
  await expect(page.getByRole("link", { name: "Snap meal" })).toHaveAttribute("href", "/log");
});

test("Day switching without refetch", async ({ page }) => {
  await signIn(page);
  await setTargets(page, ["2000", "150", "200", "70"]);
  const past = addDays(today, -2);
  await insertMeal(page, past, [item("Oats", 1900, 4, 30, 2)]);
  await logMeal(page, [item("Rice", 72.4, 6.3, 0.4, 4.8)]);

  const rice = page.getByRole("listitem").filter({ hasText: "Rice" });
  await expect(rice).toContainText("1 item · 72 kcal");
  await expect(rice).toContainText(/\d{1,2}:\d{2}\s[AP]M/);
  const target = dayButton(page, past, ", goal met");
  await expect(target).toBeVisible();
  for (const b of await strip(page).getByRole("button").all()) expect((await b.boundingBox())!.height).toBe(62);

  const requests: string[] = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  await target.click();
  await expect(target).toHaveAttribute("aria-pressed", "true");
  await expect(dayButton(page, today)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Oats")).toBeVisible();
  await expect(page.getByText("1 item · 1900 kcal")).toBeVisible();
  await expect(page.getByText("Rice")).toHaveCount(0);
  await expect(page.getByText("1 items")).toHaveCount(0);
  await expect(highlight(page)).toHaveAttribute("style", /translateX\(400%\)/);
  await expect(highlight(page)).toHaveCSS("transition-duration", "0.59s");
  expect(await highlight(page).evaluate((el) => getComputedStyle(el).transitionTimingFunction)).toContain("linear(");
  await expect(page.locator("h1")).toHaveText("Today");
  await expect(page.locator("main").getByText(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), /)).toHaveCount(0);
  await expect(target.getByText(String(Number(past.slice(-2))))).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(dayButton(page, today).locator("span").first()).toHaveCSS("color", "rgb(92, 99, 112)");
  const tile = page.getByRole("listitem").filter({ hasText: "Oats" }).locator("span").first();
  const tb = (await tile.boundingBox())!;
  expect(Math.round(tb.width)).toBe(46);
  expect(Math.round(tb.height)).toBe(46);
  await expect(tile).toHaveText("O");

  await dayButton(page, addDays(today, -1)).click();
  await expect(page.getByText(EMPTY)).toBeVisible();
  await expect(page.getByRole("link", { name: "Snap meal" })).toHaveAttribute("href", "/log");
  expect(requests.filter((p) => p === "/")).toEqual([]);
  expect(await page.locator("button button, a a, a button, button a").count()).toBe(0);
});

test("Keyboard / roving tabindex", async ({ page }) => {
  await signIn(page);
  const buttons = strip(page).getByRole("button");
  const at = async (i: number) => {
    await expect(buttons.nth(i)).toBeFocused();
    await expect(buttons.nth(i)).toHaveAttribute("aria-pressed", "true");
    await expect(strip(page).locator('button[tabindex="0"]')).toHaveCount(1);
    await expect(buttons.nth(i)).toHaveAttribute("tabindex", "0");
  };
  await buttons.nth(6).focus();
  await page.keyboard.press("ArrowLeft");
  await at(5);
  await expect(dayButton(page, addDays(today, -1))).toBeFocused();
  await page.keyboard.press("Home");
  await at(0);
  await page.keyboard.press("ArrowLeft");
  await at(0);
  await page.keyboard.press("End");
  await at(6);
  await page.keyboard.press("ArrowRight");
  await at(6);
  await page.keyboard.press("Tab");
  await expect(buttons.locator(":focus")).toHaveCount(0);
  await expect(strip(page).locator(":focus")).toHaveCount(0);
});

test("No horizontal scroll at 320x568", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signIn(page);
  await logMeal(page, [item("x".repeat(80), 200, 10, 20, 5)]);
  const name = page.getByText("x".repeat(80));
  await expect(name).toBeVisible();
  const row = (await page.getByRole("listitem").filter({ hasText: "x".repeat(80) }).boundingBox())!;
  const time = (await page.getByText(/^\d{1,2}:\d{2}\s[AP]M$/).boundingBox())!;
  expect(time.x + time.width).toBeLessThanOrEqual(row.x + row.width);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth);
  expect(await overflow()).toBeLessThanOrEqual(320);
  const buttons = strip(page).getByRole("button");
  for (const b of await buttons.all()) expect((await b.boundingBox())!.width).toBeGreaterThanOrEqual(40);
  await buttons.nth(0).click();
  expect(await overflow()).toBeLessThanOrEqual(320);
  // D-2.6: keyboard focus on the selected day is an inset outline.
  await buttons.nth(6).click();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(buttons.nth(6)).toBeFocused();
  await expect(buttons.nth(6)).toHaveCSS("outline-style", "solid");
  await expect(buttons.nth(6)).toHaveCSS("outline-offset", "-2px");
});

test("No console errors or hydration warnings", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  await signIn(page);
  await page.goto("/");
  await dayButton(page, addDays(today, -3)).click();
  await dayButton(page, addDays(today, -1)).click();
  await expect(page.getByText(EMPTY)).toBeVisible();
  expect(problems).toEqual([]);
});

test("Rapid switching, row order, stagger and reduced motion", async ({ page }) => {
  await signIn(page);
  await logMeal(page, [item("Rice", 72.4, 6.3, 0.4, 4.8)]);
  await logMeal(page, [item("Toast", 195, 4, 42, 0.4)]);
  const rows = page.getByRole("listitem");
  await expect(rows.first()).toContainText("Rice");
  await expect(rows.nth(1)).toHaveCSS("animation-delay", "0.06s");

  await dayButton(page, addDays(today, -2)).click();
  await dayButton(page, addDays(today, -1)).click();
  await page.waitForTimeout(1200);
  await expect(dayButton(page, addDays(today, -1))).toHaveAttribute("aria-pressed", "true");
  await expect(highlight(page)).toHaveAttribute("style", /translateX\(500%\)/);
  await expect(page.getByText(EMPTY)).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(highlight(page)).toHaveCSS("transition-duration", "0.2s");
  await dayButton(page, today).click();
  await expect(rows.first()).toHaveCSS("animation-name", "none");
});
