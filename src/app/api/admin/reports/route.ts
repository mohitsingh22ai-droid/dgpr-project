import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { getAdminReportsData } from "@/modules/orders/order-store";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("from") || searchParams.get("date_from") || undefined;
    const dateTo = searchParams.get("to") || searchParams.get("date_to") || undefined;

    const data = await getAdminReportsData(dateFrom, dateTo);

    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to generate report";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
