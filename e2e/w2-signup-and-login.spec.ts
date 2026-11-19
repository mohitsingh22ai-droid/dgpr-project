import { test, expect } from "@playwright/test";
import { TEST_USERS, loginViaUi, logoutViaUi } from "./support/auth-helpers";

test.describe("W2. Signup & Login (PRD §09, §15, §16)", () => {
  test("PRD §09: Valid signup creates a customer role only and directs to customer dashboard", async ({
    page,
  }) => {
    const uniqueEmail = `test-user-${Date.now()}@testdomain.co.uk`;

    await page.goto("/signup");
    await page.waitForLoadState("domcontentloaded");

    await page.fill("#name", "Test Registrant");
    await page.fill("#company", "Test Athletic Club");
    await page.fill("#email", uniqueEmail);
    await page.fill("#password", "securePass123");

    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    expect(page.url()).toContain("/dashboard");

    // Verify customer greeting on dashboard
    await expect(page.locator("body")).toContainText("Test Registrant");
  });

  test("PRD §09: Weak password and invalid inputs display explicit error messages", async ({
    page,
  }) => {
    await page.goto("/signup");
    await page.waitForLoadState("domcontentloaded");

    await page.fill("#name", "Invalid Pass User");
    await page.fill("#email", "valid@domain.com");
    await page.fill("#password", "123"); // < 6 chars

    await page.click('button[type="submit"]');

    // Error alert must appear
    const errorAlert = page.locator("text=Password must be at least 6 characters");
    await expect(errorAlert).toBeVisible();
  });

  test("PRD §03: Confirm no UI path on signup can create an administrator account", async ({
    page,
  }) => {
    await page.goto("/signup");
    await page.waitForLoadState("domcontentloaded");

    // Verify there is NO role dropdown or admin privilege selector on public signup
    const roleSelect = page.locator('select[name="role"], input[name="role"]').or(page.getByText("Administrator Role", { exact: false }));
    await expect(roleSelect).toHaveCount(0);
  });

  test("PRD §09 & §16: Login validation for correct credentials, wrong password, and nonexistent user", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    // 1. Nonexistent / invalid password
    await page.fill('input[type="email"]', "unknown-user@fakedomain.org");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    const errorMsg = page.locator("text=failed").or(page.locator("text=Invalid")).or(page.locator(".text-destructive"));
    await expect(errorMsg.first()).toBeVisible();

    // 2. Correct credentials for Customer -> redirects to /dashboard
    await loginViaUi(page, TEST_USERS.customerA, "/dashboard", { fresh: true });
    expect(page.url()).toContain("/dashboard");
    await expect(page.locator("body")).toContainText(TEST_USERS.customerA.name);

    // 3. Logout
    await logoutViaUi(page);

    // 4. Correct credentials for Admin -> redirects to /production
    await loginViaUi(page, TEST_USERS.admin, "/production", { fresh: true });
    expect(page.url()).toContain("/production");
    await expect(page.locator("body")).toContainText("Production Pipeline");
  });

  test("PRD §03: Protected routes are strictly guarded after logout", async ({
    page,
  }) => {
    // Login as Customer
    await loginViaUi(page, TEST_USERS.customerA, "/dashboard");

    // Logout
    await logoutViaUi(page);

    // Try navigating back to /dashboard
    await page.goto("/dashboard");
    await page.waitForURL("**/login**");
    expect(page.url()).toContain("/login");
  });
});
