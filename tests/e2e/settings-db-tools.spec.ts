import { expect, test } from "@playwright/test";

import { signInAsAdmin } from "./helpers/admin";

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

test("settings replaces invalid query params with canonical values", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/settings?table=notatable&page=-9&pageSize=999&sort=sideways&filter=admin");

  await expect(page).toHaveURL(/table=transcripts/);
  await expect(page).toHaveURL(/page=1/);
  await expect(page).toHaveURL(/pageSize=25/);
  await expect(page).toHaveURL(/sort=default/);
  await expect(page).toHaveURL(/filter=admin/);
});
