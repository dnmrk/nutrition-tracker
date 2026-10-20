import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";

const FIELDS = ["Calories (kcal)", "Protein (g)", "Carbs (g)", "Fat (g)"];

async function save(page: Page, values: string[]) {
  for (const [i, label] of FIELDS.entries()) await page.getByLabel(label).fill(values[i]);
  await page.getByRole("button", { name: "Save targets" }).click();
}

async function expectValues(page: Page, values: string[]) {
  for (const [i, label] of FIELDS.entries()) await expect(page.getByLabel(label)).toHaveValue(values[i]);
}

test("targets persist, prefill and upsert idempotently", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Daily targets" })).toBeVisible();
  await expectValues(page, ["", "", "", ""]);

  const values = ["2000", "150", "200", "70"];
  await save(page, values);
  await expect(page.getByRole("status")).toHaveText("Targets saved.");
  await page.reload();
  await expectValues(page, values);

  await save(page, values);
  await expect(page.getByRole("status")).toHaveText("Targets saved.");
  await page.reload();
  await expectValues(page, values);
});

test("out-of-range values posted around the client show an inline error", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await page.evaluate(() =>
    document.querySelectorAll("input").forEach((i) => {
      i.removeAttribute("min");
      i.removeAttribute("max");
    }),
  );
  await save(page, ["0", "150", "200", "70"]);
  await expect(page.locator("form").getByRole("alert")).toHaveText("Some values are out of range.");
  await expect(page.getByRole("status")).toHaveCount(0);
  await expectValues(page, ["0", "150", "200", "70"]); // typed input is kept

  // The error does not survive the next successful submit.
  await save(page, ["1800", "150", "200", "70"]);
  await expect(page.getByRole("status")).toHaveText("Targets saved.");
  await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
});
