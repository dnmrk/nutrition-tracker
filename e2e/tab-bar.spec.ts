import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";

const ROUTES = [
  ["/", "Today"],
  ["/log", "Log"],
  ["/history", "History"],
  ["/settings", "Settings"],
] as const;
const LABELS = ROUTES.map(([, label]) => label);

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("every route shows the 4 tabs with exactly the current one marked", async ({ page }) => {
  for (const [path, current] of ROUTES) {
    await page.goto(path);
    const links = nav(page).getByRole("link");
    await expect(links).toHaveText(LABELS);
    await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1);
    for (const label of LABELS) {
      const link = nav(page).getByRole("link", { name: label, exact: true });
      if (label === current) {
        await expect(link).toHaveAttribute("aria-current", "page");
        await expect(link).toHaveCSS("font-weight", "600");
      } else {
        await expect(link).not.toHaveAttribute("aria-current", /.*/);
        await expect(link).toHaveCSS("font-weight", "400");
      }
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    }
    expect(await page.locator("button button, a a, a button, button a").count()).toBe(0);
  }
});

test("clicking History navigates and marks it current", async ({ page }) => {
  await page.goto("/");
  await nav(page).getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL("/history");
  await expect(nav(page).getByRole("link", { name: "History" })).toHaveAttribute("aria-current", "page");
});

test("the column is at most 430 px and centred; the bar sits at the viewport bottom", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/settings");
  const box = (await nav(page).boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(430);
  expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThanOrEqual(1);

  for (const [width, height] of [[390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/settings");
    const b = (await nav(page).boundingBox())!;
    expect(Math.round(b.y + b.height)).toBe(height);
  }
});

test("Sign out lives on Settings only, in its own form", async ({ page }) => {
  const signOut = page.getByRole("button", { name: "Sign out" });
  await page.goto("/");
  await expect(signOut).toHaveCount(0);
  await page.goto("/settings");
  await expect(signOut).toHaveCount(1);
  expect(await page.locator("form form").count()).toBe(0);
});

test("no horizontal scroll at 320 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const [path] of ROUTES) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});

test("keyboard focus never lands under the tab bar", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const path of ["/settings", "/"]) {
    await page.goto(path);
    const navTop = (await nav(page).boundingBox())!.y;
    // Tab until focus reaches the nav; every control before it must sit above it.
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      const { inNav, bottom } = await page.evaluate(() => {
        const el = document.activeElement!;
        return {
          inNav: !!el.closest('nav[aria-label="Main"]'),
          bottom: el.getBoundingClientRect().bottom,
        };
      });
      if (inNav) break;
      expect(bottom).toBeLessThanOrEqual(navTop + 0.5);
    }
  }
});

test("tab links show an inset foreground focus outline", async ({ page }) => {
  await page.goto("/");
  await nav(page).getByRole("link", { name: "Log" }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const log = nav(page).getByRole("link", { name: "Log" });
  await expect(log).toBeFocused();
  await expect(log).toHaveCSS("outline-style", "solid");
  await expect(log).toHaveCSS("outline-offset", "-2px");
});
