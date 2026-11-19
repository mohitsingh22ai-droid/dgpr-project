import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server-auth";
import { getOrderById } from "@/modules/orders/order-store";
import { createReorderDraft } from "@/modules/orders/reorder-service";

/** One-click reorder of the caller's own paid order; returns the new job for checkout. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized: sign in to reorder." }, { status: 401 });

  const { id } = await params;
  const order = await getOrderById(id);
  if (!order || order.customer_id !== user.id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  try {
    const { draftId } = await createReorderDraft(order, { id: user.id, email: user.email });
    return NextResponse.json({ draftId, checkoutUrl: `/checkout?draft=${draftId}` }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Reorder failed" }, { status: 409 });
  }
}
