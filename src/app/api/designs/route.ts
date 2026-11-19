import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server-auth";
import { getSavedDesignsForUser, saveDesign } from "@/modules/designs/saved-designs-store";
import { z } from "zod";
import { getProductById } from "@/modules/catalog/catalog-store";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getAuthUser(req);
    if (!sessionUser) {
      return NextResponse.json(
        { error: "Unauthorized: Valid session required to view saved designs" },
        { status: 401 }
      );
    }

    const designs = await getSavedDesignsForUser(sessionUser.id, sessionUser.role);
    return NextResponse.json({ designs });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to retrieve saved designs";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

const SaveDesignSchema = z.object({
  productId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  material: z.string().min(1),
  canvasState: z.record(z.unknown()),
  previewUrl: z.string().url().max(2048).optional(),
});

/** Saves a design to the signed-in customer's library. */
export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getAuthUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized: Valid session required to save a design" }, { status: 401 });
    }

    const parsed = SaveDesignSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid design", details: parsed.error.format() }, { status: 400 });
    }
    if (JSON.stringify(parsed.data.canvasState).length > 1_000_000) {
      return NextResponse.json({ error: "The design is too large to save." }, { status: 413 });
    }

    const product = await getProductById(parsed.data.productId);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const saved = await saveDesign({
      customer_id: sessionUser.id,
      product_id: product.id,
      name: parsed.data.name,
      width_mm: parsed.data.widthMm,
      height_mm: parsed.data.heightMm,
      material: parsed.data.material,
      canvas_state: parsed.data.canvasState,
      preview_url: parsed.data.previewUrl,
    });
    return NextResponse.json({ design: saved }, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to save design";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
