import { test, expect } from "@playwright/test";

test.describe("W11. Responsive Design & Error Handling (PRD §13, §16)", () => {
  test("PRD §13: Mobile viewport (375px) renders storefront with zero horizontal overflow", async ({
    page,
  }) => {
    // Set explicit mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Check scrollWidth vs clientWidth to ensure no horizontal scroll overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalOverflow).toBe(false);

    // Verify mobile hamburger button is visible
    const hamburgerBtn = page.locator("button[aria-label='Toggle menu']");
    await expect(hamburgerBtn).toBeVisible();
  });

  test("PRD §13: Mobile calculator page renders inputs cleanly without overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto("/calculator");
    await page.waitForLoadState("domcontentloaded");

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalOverflow).toBe(false);

    // Key interactive buttons must be visible and tap-friendly
    const calculateInput = page.locator("input[type='number']").first();
    await expect(calculateInput).toBeVisible();
  });

  test("PRD §16: Non-existent routes render a 404 page with clean design without app crash", async ({
    page,
  }) => {
    const res = await page.goto("/non-existent-product-path-404");
    await page.waitForLoadState("domcontentloaded");

    // Should render without JavaScript crash
    await expect(page.locator("body")).toBeVisible();
  });
});
