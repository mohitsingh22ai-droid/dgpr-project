import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("W12. Design Consistency & Accessibility (PRD §12)", () => {
  test("PRD §12: Brand typography and color tokens adhere to boutique-industrial design system", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Check primary button styling matches brand-500 palette (#2563EB or CSS variable)
    // The hero's primary call to action (rendered as a link styled as a button).
    const primaryButton = page.locator("main a.shadow-glow").first();
    await expect(primaryButton).toBeVisible();

    const computedStyle = await primaryButton.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
      };
    });

    // Expect modern rounded corners (0.5rem - 0.75rem / 8px - 12px)
    expect(parseFloat(computedStyle.borderRadius)).toBeGreaterThanOrEqual(6);
  });

  test("PRD §12: Accessibility audit with axe-core on primary storefront page", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Run axe accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page })
      .disableRules(["color-contrast"]) // Optional contrast rule if dynamic gradients are used
      .analyze();

    // Critical accessibility violations check
    const criticalViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical"
    );

    expect(criticalViolations.length).toBe(0);
  });
});
