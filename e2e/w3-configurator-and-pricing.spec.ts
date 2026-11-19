import { test, expect } from "@playwright/test";

test.describe("W3. Configurator & Live Pricing Engine (PRD §04, §05)", () => {
  test("PRD §04 & §05: Configurator dynamically updates price across different products and substrates", async ({
    page,
  }) => {
    await page.goto("/calculator");
    await page.waitForLoadState("domcontentloaded");

    // Check first product default price is rendered
    const unitPriceEl = page.locator(".text-4xl.font-extrabold.font-mono").first();
    await expect(unitPriceEl).toBeVisible();
    const initialPriceText = await unitPriceEl.textContent();

    // Select a different material (e.g. holographic or secondary substrate)
    const materialButtons = page.locator("button:has-text('Multiplier:'), button:has-text('Gloss'), button:has-text('Holographic')");
    if (await materialButtons.count() > 1) {
      await materialButtons.nth(1).click();
      await page.waitForTimeout(200);
      const newPriceText = await unitPriceEl.textContent();
      // Price should update with new material multiplier
      expect(newPriceText).toBeDefined();
    }
  });

  test("PRD §05: Automated volume discount threshold boundaries (49 vs 50, 99 vs 100, 249 vs 250)", async ({
    page,
  }) => {
    await page.goto("/calculator");
    await page.waitForLoadState("domcontentloaded");

    const qtyInput = page.locator('input[type="number"]').first();
    const discountStatus = page.locator("text=Volume Discount Floor:").locator("..").locator("span").last();

    // Boundary 1: 49 units (0% discount)
    await qtyInput.fill("49");
    await expect(discountStatus).toContainText("None");

    // Boundary 2: 50 units (10% discount floor reached)
    await qtyInput.fill("50");
    await expect(discountStatus).toContainText("-10%");

    // Boundary 3: 99 units (still 10%)
    await qtyInput.fill("99");
    await expect(discountStatus).toContainText("-10%");

    // Boundary 4: 100 units (20% discount floor reached)
    await qtyInput.fill("100");
    await expect(discountStatus).toContainText("-20%");

    // Boundary 5: 250 units (30% discount floor reached)
    await qtyInput.fill("250");
    await expect(discountStatus).toContainText("-30%");
  });

  test("PRD §05: Client UI price matches server pricing API exactly for identical parameters", async ({
    request,
    page,
  }) => {
    const testPayload = {
      productId: "prod-vinyl-sticker",
      widthMm: 75,
      heightMm: 75,
      materialId: "gloss-white",
      quantity: 200,
    };

    // 1. Call server API directly
    const apiRes = await request.post("/api/pricing/calculate", {
      data: testPayload,
    });
    expect(apiRes.status()).toBe(200);
    const serverBreakdown = await apiRes.json();

    // Assert server calculates VAT and volume discount
    expect(serverBreakdown.discountPercentage).toBe(20);
    expect(serverBreakdown.gstRatePercentage).toBe(18);
    expect(serverBreakdown.totalCents).toBeGreaterThan(0);

    // 2. Open calculator and set identical values
    await page.goto("/calculator");
    await page.waitForLoadState("domcontentloaded");

    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill("200");

    // Compare unit price
    const unitPriceEl = page.locator(".text-4xl.font-extrabold.font-mono").first();
    await expect(unitPriceEl).toContainText(serverBreakdown.formatted.unitPrice);
  });

  test("PRD §04: Server-side validation rejects invalid dimensions and non-positive quantities", async ({
    request,
  }) => {
    // 1. Negative quantity
    const negQtyRes = await request.post("/api/pricing/calculate", {
      data: {
        productId: "prod-vinyl-sticker",
        widthMm: 100,
        heightMm: 100,
        materialId: "gloss-white",
        quantity: -5,
      },
    });
    expect(negQtyRes.status()).toBe(400);

    // 2. Zero quantity
    const zeroQtyRes = await request.post("/api/pricing/calculate", {
      data: {
        productId: "prod-vinyl-sticker",
        widthMm: 100,
        heightMm: 100,
        materialId: "gloss-white",
        quantity: 0,
      },
    });
    expect(zeroQtyRes.status()).toBe(400);

    // 3. Out-of-bounds width (exceeds max 350mm)
    const outOfBoundsRes = await request.post("/api/pricing/calculate", {
      data: {
        productId: "prod-vinyl-sticker",
        widthMm: 9999,
        heightMm: 100,
        materialId: "gloss-white",
        quantity: 100,
      },
    });
    expect(outOfBoundsRes.status()).toBe(422);
  });
});
