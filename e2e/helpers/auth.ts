import { expect, type Page } from "@playwright/test";

const MAILPIT = "http://127.0.0.1:54324/api/v1";

export async function signIn(
  page: Page,
  email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Check your email for a sign-in link.",
  );

  let id: string | undefined;
  const deadline = Date.now() + 10_000;
  while (!id && Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:${email}`)}`);
    id = (await res.json()).messages?.[0]?.ID;
    if (!id) await new Promise((r) => setTimeout(r, 250));
  }
  if (!id) throw new Error(`No magic-link email for ${email} within 10 s`);

  const html: string = (await (await fetch(`${MAILPIT}/message/${id}`)).json()).HTML;
  const href = /href="([^"]+)"/.exec(html)?.[1].replaceAll("&amp;", "&");
  if (!href) throw new Error("No link found in the magic-link email");

  await page.goto(href);
  await page.waitForURL("/");
  return email;
}
