import { Product, PricingTier } from "@/types/database";
import { splitGst, formatINR } from "./gst";

/**
 * Pricing engine (PRD § 05). Pure and shared by the browser (instant calculator)
 * and the server (authoritative price at checkout). All amounts are paise.
 *
 * unit = round((base + area_cm² × per_cm²) × material multiplier)
 * discounted unit = max(1, round(unit × (1 − tier%)))   (tier = highest floor ≤ quantity)
 * subtotal = discounted unit × quantity
 * GST on the subtotal: CGST+SGST (intra-state) or IGST (inter-state)
 */

export const MAX_QUANTITY = 100_000;

export interface PricingCalculationInput {
  product: Product & { pricing_tiers?: PricingTier[]; gst_rate?: number };
  widthMm: number;
  heightMm: number;
  materialId: string;
  quantity: number;
  /** GST state code of the delivery address; omitted for quotes. */
  placeOfSupply?: string | null;
  customTiers?: PricingTier[];
}

export interface PricingBreakdown {
  areaSqCm: number;
  materialName: string;
  materialMultiplier: number;
  baseUnitPriceCents: number;
  areaPriceCents: number;
  rawUnitPriceCents: number;
  discountPercentage: number;
  discountedUnitPriceCents: number;
  subtotalCents: number;
  gstRatePercentage: number;
  placeOfSupply: string;
  isInterState: boolean;
  cgstCents: number;
  sgstCents: number;
  igstCents: number;
  taxCents: number;
  totalCents: number;
  currency: "INR";
  formatted: {
    unitPrice: string;
    subtotal: string;
    tax: string;
    total: string;
  };
}

export class PricingValidationError extends Error {}

/**
 * Validates a configuration against the product's parameters. Returns an error
 * message, or null when the configuration can be produced.
 */
export function validateConfiguration(
  product: Product,
  input: { widthMm: number; heightMm: number; materialId: string; quantity: number; orientation?: string }
): string | null {
  const { widthMm, heightMm, materialId, quantity } = input;
  if (!Number.isFinite(widthMm) || widthMm < product.min_width_mm || widthMm > product.max_width_mm) {
    return `Width must be between ${product.min_width_mm}mm and ${product.max_width_mm}mm.`;
  }
  if (!Number.isFinite(heightMm) || heightMm < product.min_height_mm || heightMm > product.max_height_mm) {
    return `Height must be between ${product.min_height_mm}mm and ${product.max_height_mm}mm.`;
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return `Quantity must be a whole number between 1 and ${MAX_QUANTITY.toLocaleString("en-IN")}.`;
  }
  if (product.allowed_materials.length > 0 && !product.allowed_materials.some((m) => m.id === materialId)) {
    return `Material '${materialId}' is not available for ${product.name}.`;
  }
  if (input.orientation && !product.allowed_orientations.includes(input.orientation as never)) {
    return `Orientation '${input.orientation}' is not available for ${product.name}.`;
  }
  return null;
}

export function resolveDiscountTier(tiers: PricingTier[], quantity: number): number {
  const tier = [...tiers].sort((a, b) => b.min_quantity - a.min_quantity).find((t) => quantity >= t.min_quantity);
  return tier ? tier.discount_percentage : 0;
}

export function calculatePrintPrice(input: PricingCalculationInput): PricingBreakdown {
  const { product, widthMm, heightMm, materialId, quantity, customTiers, placeOfSupply } = input;

  const problem = validateConfiguration(product, { widthMm, heightMm, materialId, quantity });
  if (problem) throw new PricingValidationError(problem);

  const areaSqCm = (widthMm * heightMm) / 100;
  const material = product.allowed_materials.find((m) => m.id === materialId) ?? {
    id: "standard",
    name: "Standard",
    description: "",
    multiplier: 1,
  };

  const baseUnitPriceCents = product.base_price_cents;
  const areaPriceCents = Math.round(areaSqCm * product.price_per_sq_cm_cents);
  const rawUnitPriceCents = Math.round((baseUnitPriceCents + areaPriceCents) * material.multiplier);

  const discountPercentage = resolveDiscountTier(customTiers ?? product.pricing_tiers ?? [], quantity);
  const discountedUnitPriceCents = Math.max(1, Math.round(rawUnitPriceCents * (1 - discountPercentage / 100)));
  const subtotalCents = discountedUnitPriceCents * quantity;

  const gst = splitGst(subtotalCents, product.gst_rate ?? 18, placeOfSupply);
  const totalCents = subtotalCents + gst.taxCents;

  return {
    areaSqCm,
    materialName: material.name,
    materialMultiplier: material.multiplier,
    baseUnitPriceCents,
    areaPriceCents,
    rawUnitPriceCents,
    discountPercentage,
    discountedUnitPriceCents,
    subtotalCents,
    ...gst,
    totalCents,
    currency: "INR",
    formatted: {
      unitPrice: formatINR(discountedUnitPriceCents),
      subtotal: formatINR(subtotalCents),
      tax: formatINR(gst.taxCents),
      total: formatINR(totalCents),
    },
  };
}
