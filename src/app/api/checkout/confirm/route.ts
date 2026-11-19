import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server-auth";
import { getOrderById } from "@/modules/orders/order-store";
import { stripe, finalizePaidSession } from "@/modules/orders/payment-service";

/**
 * Called by the dashboard when Stripe redirects back after payment. The session is
 * fetched from Stripe's API (never trusted from the URL alone) and finalized with
 * the same idempotent logic as the webhook, so the order is confirmed even when
 * the webhook is delayed or not configured (e.g. local development).
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = (await req.json().catch(() => ({}))) as { sessionId?: string };
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return NextResponse.json({ error: "A valid checkout session id is required." }, { status: 400 });
  }

  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    const orderId = session.metadata?.orderId || session.client_reference_id;
    const order = orderId ? await getOrderById(orderId) : null;
    if (!order || (order.customer_id !== user.id && user.role !== "admin")) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (session.payment_status !== "paid") {
      return NextResponse.json({ status: "pending", orderNumber: order.order_number, paymentStatus: session.payment_status });
    }
    const result = await finalizePaidSession(session);
    return NextResponse.json({ status: "paid", orderNumber: result.orderNumber });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Could not confirm payment";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
