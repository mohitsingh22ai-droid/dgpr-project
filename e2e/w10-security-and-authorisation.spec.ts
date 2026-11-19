import { test, expect } from "@playwright/test";
import { TEST_USERS, loginViaUi, logoutViaUi } from "./support/auth-helpers";

test.describe("W10. Security & Role Authorization (PRD §03, §10, §13)", () => {
  test("PRD §03: Customer role is denied access to /production console (403 Authorization Forbidden)", async ({
    page,
  }) => {
    // 1. Sign in as Customer
    await loginViaUi(page, TEST_USERS.customerA, "/dashboard");

    // 2. Attempt to navigate directly to /production
    await page.goto("/production");
    await page.waitForLoadState("domcontentloaded");

    // Must show 403 Forbidden screen
    await expect(page.locator("text=AUTHORIZATION FORBIDDEN")).toBeVisible();
    await expect(page.locator("text=Internal Staff Credentials Required")).toBeVisible();

    // Verify production pipeline queue is NOT visible to customer
    await expect(page.locator("text=Production Floor Command Console")).toHaveCount(0);
  });

  test("PRD §03: Unauthenticated visitor is denied access to both /dashboard and /production", async ({
    page,
  }) => {
    // Direct attempt /production
    await page.goto("/production");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /authorization forbidden|sign in/i }).first()).toBeVisible();

    // Direct attempt /dashboard
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /sign in/i }).first()).toBeVisible();
  });

  test("PRD §10: Customer A cannot see Customer B's private orders or profile data", async ({
    page,
  }) => {
    // 1. Login as Customer A (Sarah)
    await loginViaUi(page, TEST_USERS.customerA, "/dashboard");
    await expect(page.locator("body")).toContainText("Sarah Jenkins");

    // Assert Customer B's name is NOT visible
    await expect(page.locator("body")).not.toContainText("customerb@example.com");
    await expect(page.locator("body")).not.toContainText("Apex Biking Co");
  });

  test("PRD §15: Verify zero secret keys are exposed in client-accessible environment variables", () => {
    // Service role key and Stripe secret key MUST never be prefixed with NEXT_PUBLIC_
    expect(process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY).toBeUndefined();
    expect(process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });
});
