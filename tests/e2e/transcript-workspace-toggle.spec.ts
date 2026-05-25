import { expect, test } from "@playwright/test";

import { signInAsAdmin } from "./helpers/admin";

async function openSeededMappingTranscript(page: import("@playwright/test").Page) {
  await page.goto("/transcripts?q=Cuomo");

  const reviewLinks = page.getByRole("link", { name: "Review" });
  const reviewCount = await reviewLinks.count();
  test.skip(reviewCount === 0, "No seeded transcript rows available to validate the mapping workspace.");

  await reviewLinks.first().click();
  await expect(page).toHaveURL(/\/transcripts\/[^/?]+/);
  test.skip(
    (await page.getByRole("tab", { name: "Catalog Mapping" }).count()) === 0,
    "Selected transcript does not have a mapping workspace.",
  );
}

test("mapping workspace toggle opens transcript preview and preserves view state", async ({ page }) => {
  await signInAsAdmin(page);
  await openSeededMappingTranscript(page);

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

test("mapping workspace warns before discarding dirty mapping edits", async ({ page }) => {
  await signInAsAdmin(page);
  await openSeededMappingTranscript(page);

  const rationale = page.getByLabel("Mapping Rationale");
  test.skip((await rationale.count()) === 0, "Selected transcript does not have a mapping editor.");

  await expect(page.getByRole("group", { name: /Mapping decision status/ })).toBeVisible();
  await rationale.fill(`Dirty guard e2e ${Date.now()}`);

  const mappingTab = page.getByRole("tab", { name: "Catalog Mapping" });
  const previewTab = page.getByRole("tab", { name: "Transcript Preview" });

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("unsaved mapping changes");
    await dialog.dismiss();
  });
  await previewTab.click();
  await expect(mappingTab).toHaveAttribute("aria-selected", "true");

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await previewTab.click();
  await expect(previewTab).toHaveAttribute("aria-selected", "true");
});
