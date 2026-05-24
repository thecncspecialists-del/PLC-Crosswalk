import { expect, test } from "@playwright/test";

async function signInAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(process.env.ADMIN_EMAIL ?? "admin@machinists.institute");
  await page.locator('input[name="password"]').fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/transcripts/);
}

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test("mobile viewport has no page-level horizontal overflow on key routes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsAdmin(page);

  await page.goto("/transcripts");
  await expectNoPageOverflow(page);

  await page.goto("/reports");
  await expectNoPageOverflow(page);

  await page.goto("/settings");
  await expectNoPageOverflow(page);

  await page.goto("/transcripts");
  const reviewLinks = page.getByRole("link", { name: "Review" });
  if ((await reviewLinks.count()) > 0) {
    await reviewLinks.first().click();
    await expect(page).toHaveURL(/\/transcripts\/[^/?]+/);
    await expectNoPageOverflow(page);
  }
});
