import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { getAllProducts, createProduct } from "@/modules/catalog/catalog-store";
import { logAdminAction } from "@/modules/audit/audit-store";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const products = await getAllProducts();
    return NextResponse.json({ products });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load products";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const body = await req.json();
    const result = await createProduct(body);

    if (!result.success || !result.product) {
      return NextResponse.json({ error: result.error || "Failed to create product" }, { status: 400 });
    }

    await logAdminAction(
      auth.user!.id,
      auth.user!.email,
      "product_template_edit",
      "product",
      result.product.id,
      {
        slug: result.product.slug,
        name: result.product.name,
        action: "created",
      }
    );

    return NextResponse.json({ success: true, product: result.product }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create product";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
