import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { getArchivedOrders } from "@/modules/orders/order-store";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || searchParams.get("q") || undefined;
    const customer = searchParams.get("customer") || undefined;
    const product_type = searchParams.get("product_type") || searchParams.get("division") || undefined;
    const date_from = searchParams.get("date_from") || undefined;
    const date_to = searchParams.get("date_to") || undefined;

    const result = await getArchivedOrders({
      query,
      customer,
      product_type,
      date_from,
      date_to,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load archive";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
