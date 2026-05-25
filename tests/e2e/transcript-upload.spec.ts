import { expect, test } from "@playwright/test";
import { join } from "node:path";

import { signInAsAdmin } from "./helpers/admin";

const pdfFixture = join(__dirname, "fixtures", "transcript-upload-fixture.pdf");
const invalidFixture = join(__dirname, "fixtures", "not-a-transcript.txt");

test("new transcript upload can generate a report and then be removed", async ({ page }) => {
  const stamp = Date.now();
  const firstName = `E2EFirst${stamp}`;
  const lastName = `E2ELast${stamp}`;
  const studentRef = `E2E-${stamp}`;

  await signInAsAdmin(page);
  await page.goto("/transcripts");

  await page.getByRole("button", { name: "New Record" }).click();
  await page.locator('input[name="studentFirstName"]').fill(firstName);
  await page.locator('input[name="studentLastName"]').fill(lastName);
  await page.locator('input[name="studentRef"]').fill(studentRef);
  await page.locator('input[name="institutionName"]').fill("E2E Test College");
  await page.locator('input[name="file"]').setInputFiles(pdfFixture);
  await page.getByRole("button", { name: "Upload" }).click();

  await expect(page).toHaveURL(/\/transcripts\/[^/?]+/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: `${lastName}, ${firstName}` })).toBeVisible();
  await expect(page.getByRole("link", { name: /TEST 101 Intro to Testing/ })).toBeVisible();

  await page.getByRole("button", { name: "Generate Admin Report" }).click();
  await expect(page.getByText(/ADMIN report generated/)).toBeVisible({ timeout: 10_000 });

  await page.goto(`/transcripts?q=${encodeURIComponent(studentRef)}`);
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: `Delete transcript queue record for ${firstName} ${lastName}` }).click();
  await expect(page.getByText(studentRef)).toHaveCount(0);
});

test("upload form shows validation states before creating records", async ({ page }) => {
  const stamp = Date.now();

  await signInAsAdmin(page);
  await page.goto("/transcripts");

  const existingButton = page.getByRole("button", { name: "Existing Record" });
  if (await existingButton.isEnabled()) {
    await existingButton.click();
    await expect(page.getByText("Select an existing student record before updating.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Update" })).toBeDisabled();
  }

  await page.getByRole("button", { name: "New Record" }).click();
  await page.locator('input[name="file"]').setInputFiles(pdfFixture);
  await page.getByRole("button", { name: "Upload" }).click();
  const validationMessage = await page
    .locator('input[name="studentFirstName"]')
    .evaluate((element) => (element as HTMLInputElement).validationMessage);
  expect(validationMessage.length).toBeGreaterThan(0);

  await page.locator('input[name="studentFirstName"]').fill(`Invalid${stamp}`);
  await page.locator('input[name="studentLastName"]').fill("File");
  await page.locator('input[name="studentRef"]').fill(`INVALID-${stamp}`);
  await page.locator('input[name="institutionName"]').fill("E2E Test College");
  await page.locator('input[name="file"]').setInputFiles(invalidFixture);
  await page.getByRole("button", { name: "Upload" }).click();

  await expect(page).toHaveURL(/notice=upload_invalid_file_type/);
  await expect(page.getByText("Upload a valid PDF transcript file.")).toBeVisible();
});
