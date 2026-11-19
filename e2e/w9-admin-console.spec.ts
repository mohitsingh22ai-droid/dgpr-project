import { test, expect } from "@playwright/test";
import { TEST_USERS, loginViaUi } from "./support/auth-helpers";

test.describe("W9. Production console (PRD §03, §11)", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page, TEST_USERS.admin, "/production");
    await expect(page.getByTestId("admin-console")).toBeVisible({ timeout: 30000 });
  });

  test("PRD §11: console shows the job list with the six pipeline stages available as filters", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Production");
    await expect(page.getByTestId("admin-order-row").first()).toBeVisible();
    const stages = await page.getByTestId("admin-stage-filter").locator("option").allTextContents();
    for (const stage of ["QUOTE", "ORDER", "ARTWORK", "PROOF", "PRODUCTION", "COMPLETED"]) {
      expect(stages.join(" ").toUpperCase()).toContain(stage);
    }
  });

  test("PRD §11 capability 01: search by order number and filter by division", async ({ page }) => {
    await page.getByTestId("admin-search-input").fill("W2P-2026-00201");
    await expect(page.getByTestId("admin-order-row")).toHaveCount(1, { timeout: 15000 });
    await expect(page.getByTestId("admin-order-row").first()).toContainText("W2P-2026-00201");

    await page.getByTestId("admin-search-input").fill("");
    await page.getByTestId("admin-division-filter").selectOption("race-event-numbers");
    await expect(page.getByTestId("admin-order-row").first()).toBeVisible({ timeout: 15000 });
    for (const row of await page.getByTestId("admin-order-row").all()) {
      await expect(row).not.toContainText("W2P-2026-00101");
    }
  });

  test("PRD §11 capability 02: downloads are locked until paid AND proof approved", async ({ page }) => {
    // W2P-2026-00102 is unpaid: its download button must be disabled.
    await page.getByTestId("admin-search-input").fill("W2P-2026-00102");
    const lockedRow = page.getByTestId("admin-order-row").filter({ hasText: "W2P-2026-00102" });
    await expect(lockedRow).toHaveCount(1, { timeout: 15000 });
    await expect(lockedRow.getByTestId("admin-download-btn")).toBeDisabled();

    // W2P-2026-00101 is paid with an approved proof: ready.
    await page.getByTestId("admin-search-input").fill("W2P-2026-00101");
    const readyRow = page.getByTestId("admin-order-row").filter({ hasText: "W2P-2026-00101" });
    await expect(readyRow.getByTestId("admin-ready-indicator")).toContainText("Ready", { timeout: 15000 });
    await expect(readyRow.getByTestId("admin-download-btn")).toBeEnabled();
  });
});
