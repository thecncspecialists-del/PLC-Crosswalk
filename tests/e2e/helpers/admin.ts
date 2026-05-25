import { expect, type Page } from "@playwright/test";

export async function signInAsAdmin(page: Page) {
  const email = process.env.ADMIN_EMAIL ?? "admin@machinists.institute";
  const password = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  try {
    await expect(page).toHaveURL(/\/transcripts/);
  } catch (error) {
    const currentUrl = page.url();
    if (currentUrl.includes("ServiceUnavailable")) {
      throw new Error(
        "Admin sign-in reached the app, but the database is unavailable. Run `npm run app:up:dev` and rerun `npm run test:e2e`.",
      );
    }
    if (currentUrl.includes("CredentialsSignin")) {
      throw new Error(
        "Admin sign-in failed with the configured credentials. Run `npm run db:seed` so the local admin account matches `.env`, then rerun `npm run test:e2e`.",
      );
    }
    throw error;
  }
}
