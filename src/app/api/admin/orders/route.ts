import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { searchAdminOrders } from "@/modules/orders/order-store";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || searchParams.get("q") || undefined;
    const stage = searchParams.get("stage") || searchParams.get("status") || undefined;
    const payment_status = searchParams.get("payment_status") || undefined;
    const customer = searchParams.get("customer") || undefined;
    const product_type = searchParams.get("product_type") || searchParams.get("division") || undefined;
    const date_from = searchParams.get("date_from") || undefined;
    const date_to = searchParams.get("date_to") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const result = await searchAdminOrders({
      query,
      stage,
      payment_status,
      customer,
      product_type,
      date_from,
      date_to,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to search admin orders";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
