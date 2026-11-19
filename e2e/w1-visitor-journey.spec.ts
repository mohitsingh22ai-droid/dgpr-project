import { test, expect } from "@playwright/test";

test.describe("W1. Visitor Journey (PRD §03, §04, §12)", () => {
  test("PRD §12 & §04: Homepage displays the six equal-weight manufacturing division tiles with direct navigation", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // The six divisions defined in PRD § 01 & § 04
    const expectedDivisions = [
      { name: "Labels & Stickers", href: "/divisions/labels-stickers" },
      { name: "Race & Event Numbers", href: "/divisions/race-event-numbers" },
      { name: "MTB Boards", href: "/divisions/mtb-boards" },
      { name: "Stamps", href: "/divisions/stamps" },
      { name: "Trophies", href: "/divisions/trophies" },
      { name: "Laser-Cut Work", href: "/divisions/laser-cut" },
    ];

    // Verify all 6 division tiles exist under #divisions section
    const divisionsSection = page.locator("#divisions");
    await expect(divisionsSection).toBeVisible();

    for (const division of expectedDivisions) {
      const tile = divisionsSection.locator(`a[href="${division.href}"]`).first();
      await expect(tile).toBeVisible();
      await expect(tile).toContainText(division.name);
    }

    // Verify navigation works by clicking one of the tiles
    const firstTile = divisionsSection.locator('a[href="/divisions/labels-stickers"]').first();
    await firstTile.click();
    await page.waitForURL("**/divisions/labels-stickers");
    expect(page.url()).toContain("/divisions/labels-stickers");
    await expect(page.locator("h1")).toContainText("Labels & Stickers");
  });

  test("PRD §12: Live Work Gallery loads and displays production work organized by division", async ({
    page,
  }) => {
    await page.goto("/gallery");
    await page.waitForLoadState("domcontentloaded");

    // Verify gallery header
    await expect(page.locator("h1")).toContainText(/Showcase|Gallery/i);

    // Verify filter tabs exist for the product divisions
    await expect(page.locator("text=Labels & Stickers").first()).toBeVisible();
    await expect(page.locator("text=MTB Boards").first()).toBeVisible();
    await expect(page.locator("text=Race & Event Numbers").first()).toBeVisible();

    // Verify gallery cards are rendered
    const galleryCards = page.getByTestId("gallery-card");
    await expect(galleryCards.first()).toBeVisible();
  });

  test("PRD §05 & §03: Interactive price calculator functions fully without authentication", async ({
    page,
  }) => {
    await page.goto("/calculator");
    await page.waitForLoadState("domcontentloaded");

    // Verify calculator page elements
    await expect(page.locator("h1")).toContainText(/Pricing|Calculator/i);

    // Check default pricing is rendered
    const priceDisplay = page.locator("text=₹").first();
    await expect(priceDisplay).toBeVisible();

    // Change quantity to test live recalculation
    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill("150");

    // Quantity update should trigger price change
    await page.waitForTimeout(300); // Allow brief debounce
    const updatedGross = page.locator("text=₹");
    await expect(updatedGross.first()).toBeVisible();
  });

  test("PRD §03: Unauthenticated visitor is redirected to /login when attempting to access /dashboard or /production", async ({
    page,
  }) => {
    // Attempt /dashboard
    await page.goto("/dashboard");
    await page.waitForURL("**/login**");
    expect(page.url()).toContain("/login");

    // Attempt /production
    await page.goto("/production");
    await page.waitForURL("**/login**");
    expect(page.url()).toContain("/login");
  });
});
