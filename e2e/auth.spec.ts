import { expect, test } from "@playwright/test";
import { signIn } from "./helpers/auth";

test("anonymous users are redirected to /login", async ({ page }) => {
  for (const path of ["/", "/log", "/history", "/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL("/login");
  }
});

test("magic-link sign-in lands on Today", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
});

test("a bad link shows the invalid-link copy", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=bogus&type=email");
  await expect(page).toHaveURL("/login?error=link");
  await expect(page.getByRole("alert")).toHaveText(
    "That sign-in link is invalid or expired. Request a new one.",
  );
});

test("sign out returns to /login", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  await page.goto("/");
  await expect(page).toHaveURL("/login");
});

test("an authenticated visit to /login redirects to /", async ({ page }) => {
  await signIn(page);
  await page.goto("/login");
  await expect(page).toHaveURL("/");
});

test("the tz cookie is set from the browser time zone", async ({ page, context }) => {
  await page.goto("/login");
  await expect
    .poll(async () =>
      decodeURIComponent(
        (await context.cookies()).find((c) => c.name === "tz")?.value ?? "",
      ),
    )
    .toBe("Asia/Manila");
});
