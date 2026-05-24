import { expect, test } from "@playwright/test";

async function signInAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(process.env.ADMIN_EMAIL ?? "admin@machinists.institute");
  await page.locator('input[name="password"]').fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/transcripts/);
}

test("mapping workspace toggle opens transcript preview and preserves view state", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/transcripts");

  const reviewLinks = page.getByRole("link", { name: "Review" });
  const reviewCount = await reviewLinks.count();
  test.skip(reviewCount === 0, "No transcript rows available to validate workspace toggle.");

  await reviewLinks.first().click();
  await expect(page).toHaveURL(/\/transcripts\/[^/?]+/);

  const mappingTab = page.getByRole("tab", { name: "Catalog Mapping" });
  const previewTab = page.getByRole("tab", { name: "Transcript Preview" });

  await expect(mappingTab).toHaveAttribute("aria-selected", "true");
  await expect(mappingTab).toHaveAttribute("tabindex", "0");
  await expect(previewTab).toHaveAttribute("tabindex", "-1");
  await expect(mappingTab).toHaveAttribute("aria-controls", /.+/);
  const mappingPanelId = await mappingTab.getAttribute("aria-controls");
  expect(mappingPanelId).toBeTruthy();
  await expect(page.locator(`[id="${mappingPanelId}"]`)).toHaveAttribute("role", "tabpanel");

  await mappingTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(previewTab).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/workspace=preview/);

  await previewTab.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(mappingTab).toHaveAttribute("aria-selected", "true");
  await expect(page).not.toHaveURL(/workspace=preview/);

  await previewTab.click();

  await expect(previewTab).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/workspace=preview/);
  await expect(page.getByRole("heading", { name: "Uploaded Transcript Preview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Map to Catalog Course(s)" })).toBeHidden();

  const extractedCourseLinks = page.locator('aside a[href*="/transcripts/"]');
  if ((await extractedCourseLinks.count()) > 0) {
    await extractedCourseLinks.first().click();
    await expect(page).toHaveURL(/workspace=preview/);
    await expect(page.getByRole("heading", { name: "Uploaded Transcript Preview" })).toBeVisible();
  }

  await mappingTab.click();
  await expect(mappingTab).toHaveAttribute("aria-selected", "true");
  await expect(page).not.toHaveURL(/workspace=preview/);
  await expect(page.getByRole("heading", { name: "Map to Catalog Course(s)" })).toBeVisible();
});
