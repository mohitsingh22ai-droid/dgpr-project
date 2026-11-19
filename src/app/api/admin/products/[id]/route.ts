import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { updateProduct } from "@/modules/catalog/catalog-store";
import { logAdminAction } from "@/modules/audit/audit-store";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const { id } = await params;
    const body = await req.json();

    const result = await updateProduct(id, body);

    if (!result.success || !result.product) {
      return NextResponse.json({ error: result.error || "Failed to update product" }, { status: 400 });
    }

    await logAdminAction(
      auth.user!.id,
      auth.user!.email,
      "product_template_edit",
      "product",
      result.product.id,
      {
        slug: result.product.slug,
        updates: body,
      }
    );

    return NextResponse.json({ success: true, product: result.product });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update product";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
