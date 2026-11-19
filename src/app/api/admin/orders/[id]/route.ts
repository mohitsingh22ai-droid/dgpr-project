import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { getOrderById, checkReadyForProduction } from "@/modules/orders/order-store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  try {
    const { id } = await params;
    const order = await getOrderById(id);

    if (!order) {
      return NextResponse.json({ error: `Order '${id}' not found` }, { status: 404 });
    }

    const gate = checkReadyForProduction(order);

    return NextResponse.json({
      order: {
        ...order,
        isReadyForProduction: gate.isReady,
        notReadyReason: gate.reason,
        proofApproved: gate.proofApproved,
        paymentConfirmed: gate.paymentConfirmed,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load order detail";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
