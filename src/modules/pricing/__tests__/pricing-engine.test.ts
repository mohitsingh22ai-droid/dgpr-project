import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculatePrintPrice, validateConfiguration, PricingValidationError } from "../pricing-engine";
import { splitGst, isValidPinCode } from "../gst";
import { Product } from "@/types/database";

const TIERS = [
  { min_quantity: 1, discount_percentage: 0 },
  { min_quantity: 50, discount_percentage: 10 },
  { min_quantity: 100, discount_percentage: 20 },
  { min_quantity: 250, discount_percentage: 30 },
  { min_quantity: 500, discount_percentage: 40 },
  { min_quantity: 1000, discount_percentage: 50 },
];

const product = {
  id: "p", division_id: "d", division_slug: "labels-stickers", slug: "s", name: "Sticker", subtitle: "", description: "",
  base_price_cents: 400, price_per_sq_cm_cents: 25,
  min_width_mm: 25, max_width_mm: 350, min_height_mm: 25, max_height_mm: 350,
  default_width_mm: 75, default_height_mm: 75, default_bleed_mm: 3, default_safety_margin_mm: 2.5,
  allowed_materials: [
    { id: "gloss", name: "Gloss", description: "", multiplier: 1 },
    { id: "holo", name: "Holo", description: "", multiplier: 1.45 },
  ],
  allowed_orientations: ["square", "portrait", "landscape"], has_variable_data: false, image_url: "", is_active: true,
  pricing_tiers: TIERS, gst_rate: 18,
} as Product & { pricing_tiers: typeof TIERS; gst_rate: number };

const price = (quantity: number, extra: Partial<Parameters<typeof calculatePrintPrice>[0]> = {}) =>
  calculatePrintPrice({ product, widthMm: 75, heightMm: 75, materialId: "gloss", quantity, ...extra });

describe("Pricing engine (INR + GST)", () => {
  it("unit = round((base + area × per-cm²) × multiplier)", () => {
    const p = price(1);
    assert.equal(p.areaSqCm, 56.25);
    assert.equal(p.rawUnitPriceCents, 400 + Math.round(56.25 * 25));
    assert.equal(price(1, { materialId: "holo" }).rawUnitPriceCents, Math.round((400 + 1406) * 1.45));
  });

  for (const [qty, pct] of [[49, 0], [50, 10], [99, 10], [100, 20], [250, 30], [500, 40], [1000, 50], [5000, 50]]) {
    it(`quantity ${qty} gets ${pct}% discount`, () => assert.equal(price(qty).discountPercentage, pct));
  }

  it("subtotal = discounted unit × quantity; total = subtotal + GST", () => {
    const p = price(100);
    assert.equal(p.subtotalCents, p.discountedUnitPriceCents * 100);
    assert.equal(p.taxCents, Math.round(p.subtotalCents * 0.18));
    assert.equal(p.totalCents, p.subtotalCents + p.taxCents);
    assert.equal(p.currency, "INR");
    assert.match(p.formatted.total, /^₹/);
  });

  it("Delhi delivery → CGST + SGST; other states → IGST", () => {
    const intra = price(100, { placeOfSupply: "07" });
    assert.equal(intra.isInterState, false);
    assert.equal(intra.cgstCents + intra.sgstCents, intra.taxCents);
    assert.equal(intra.igstCents, 0);
    const inter = price(100, { placeOfSupply: "27" });
    assert.equal(inter.isInterState, true);
    assert.equal(inter.igstCents, inter.taxCents);
    assert.equal(inter.cgstCents + inter.sgstCents, 0);
  });

  it("splits odd tax amounts without losing a paisa", () => {
    const s = splitGst(1001, 18, "07");
    assert.equal(s.cgstCents + s.sgstCents, s.taxCents);
  });

  it("rejects out-of-range size, unknown material and bad quantity", () => {
    assert.match(validateConfiguration(product, { widthMm: 10, heightMm: 75, materialId: "gloss", quantity: 1 }) ?? "", /Width/);
    assert.match(validateConfiguration(product, { widthMm: 75, heightMm: 900, materialId: "gloss", quantity: 1 }) ?? "", /Height/);
    assert.match(validateConfiguration(product, { widthMm: 75, heightMm: 75, materialId: "nope", quantity: 1 }) ?? "", /Material/);
    assert.match(validateConfiguration(product, { widthMm: 75, heightMm: 75, materialId: "gloss", quantity: 0 }) ?? "", /Quantity/);
    assert.throws(() => price(-5), PricingValidationError);
  });

  it("validates Indian PIN codes", () => {
    assert.equal(isValidPinCode("110020"), true);
    assert.equal(isValidPinCode("010020"), false);
    assert.equal(isValidPinCode("SW1A 2AA"), false);
  });
});
