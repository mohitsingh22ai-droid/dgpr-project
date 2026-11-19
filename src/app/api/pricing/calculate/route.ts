import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculatePrintPrice, PricingValidationError } from "@/modules/pricing/pricing-engine";
import { getProductById } from "@/modules/catalog/catalog-store";

const PricingRequestSchema = z.object({
  productId: z.string().min(1),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  materialId: z.string().min(1),
  quantity: z.number().int().positive(),
  placeOfSupply: z.string().regex(/^\d{2}$/).optional(),
});

/** Public instant price (PRD § 05). Uses the live catalogue and the same engine as checkout. */
export async function POST(req: NextRequest) {
  const validated = PricingRequestSchema.safeParse(await req.json().catch(() => null));
  if (!validated.success) {
    return NextResponse.json({ error: "Invalid pricing parameters", details: validated.error.format() }, { status: 400 });
  }

  try {
    const product = await getProductById(validated.data.productId);
    if (!product || !product.is_active) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json(calculatePrintPrice({ product, ...validated.data }));
  } catch (err: unknown) {
    if (err instanceof PricingValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
