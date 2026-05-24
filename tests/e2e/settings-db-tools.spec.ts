import { expect, test } from "@playwright/test";

async function signInAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(process.env.ADMIN_EMAIL ?? "admin@machinists.institute");
  await page.locator('input[name="password"]').fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/transcripts/);
}

test("settings shows database tools, table controls, and Beekeeper launch state", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/settings?table=users&page=1&pageSize=10");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Database Tools" })).toBeVisible();
  await expect(page.getByText("Read-only portal access for operational tables.")).toBeVisible();

  await page.locator('select[name="table"]').selectOption("reports");
  await expect(page).toHaveURL(/table=reports/);
  await expect(page).toHaveURL(/page=1/);

  await expect(page.getByText(/Rows: .* \| Page /)).toBeVisible();
  await expect(page.getByText("Previous")).toBeVisible();
  await expect(page.getByText("Next")).toBeVisible();

  const nextLink = page.getByRole("link", { name: "Next" });
  if ((await nextLink.count()) > 0) {
    await nextLink.first().click();
    await expect(page).toHaveURL(/page=2/);
  }

  const launchLink = page.getByRole("link", { name: "Open Beekeeper" });
  if ((await launchLink.count()) > 0) {
    await expect(launchLink).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: "Open Beekeeper" })).toBeDisabled();
  }
});
