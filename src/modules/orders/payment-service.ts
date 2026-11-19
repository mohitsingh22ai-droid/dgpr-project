import Stripe from "stripe";
import { db, unwrap } from "@/lib/supabase/server";
import { getOrderById, updateOrderStageWithVersion } from "@/modules/orders/order-store";
import { getDraft, transitionDraftStatus } from "@/modules/drafts/draft-store";
import { generateXeroInvoicePayload } from "@/modules/orders/xero-generator";
import { safeSendNotificationEmail } from "@/modules/email/email-service";
import { formatINR } from "@/modules/pricing/gst";

/**
 * Payment lifecycle (Stripe Checkout, PRD § 05).
 *
 *   checkout     → order created at QUOTE / payment pending, draft → payment_pending
 *   Stripe paid  → finalizePaidSession: order paid + QUOTE→ORDER, draft → paid, email
 *   expired/fail → releaseUnpaidSession: order failed/cancelled, draft back to proof_approved
 *
 * Payment is only ever confirmed by Stripe: a verified webhook or a server-side
 * retrieval of the Checkout Session. Card data never touches this server.
 */

let stripeClient: Stripe | null = null;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  // fetch-based client: works on serverless/edge runtimes and honours outbound proxies.
  stripeClient ??= new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  return stripeClient;
}

export interface FinalizeResult {
  orderNumber: string;
  orderId: string;
  alreadyPaid: boolean;
}

/** Marks the order behind a paid Checkout Session as paid. Safe to call repeatedly. */
export async function finalizePaidSession(session: Stripe.Checkout.Session): Promise<FinalizeResult> {
  if (session.payment_status !== "paid") {
    throw new Error(`Checkout session ${session.id} is not paid (status: ${session.payment_status}).`);
  }
  const orderId = session.metadata?.orderId || session.client_reference_id;
  if (!orderId) throw new Error(`Checkout session ${session.id} is not linked to an order.`);

  const order = await getOrderById(orderId);
  if (!order) throw new Error(`Order ${orderId} for session ${session.id} not found.`);
  if (session.amount_total !== null && session.amount_total !== order.total_cents) {
    throw new Error(`Amount mismatch for ${order.order_number}: Stripe ${session.amount_total}, order ${order.total_cents}.`);
  }

  // Compare-and-set: only the first confirmation flips pending → paid.
  const flipped = unwrap(
    await db()
      .from("orders")
      .update({
        payment_status: "paid",
        stripe_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
      })
      .eq("id", order.id)
      .eq("payment_status", "pending")
      .select("id"),
    "Mark order paid"
  ) as Array<{ id: string }>;

  if (flipped.length === 0) {
    return { orderNumber: order.order_number, orderId: order.id, alreadyPaid: true };
  }

  await updateOrderStageWithVersion(order.order_number, "ORDER", "QUOTE", "stripe", "Payment confirmed by Stripe");

  if (order.draft_id) {
    const draft = await getDraft(order.draft_id);
    if (draft && draft.status === "payment_pending") {
      await transitionDraftStatus(draft.id, "paid", { id: order.customer_id, email: order.customer_email || "" }, {
        stripeSessionId: session.id,
        orderNumber: order.order_number,
      });
    }
  }

  const paidOrder = (await getOrderById(order.id))!;
  unwrap(
    await db().from("orders").update({ xero_invoice: generateXeroInvoicePayload(paidOrder) }).eq("id", order.id),
    "Store accounting payload"
  );

  await safeSendNotificationEmail({
    to: paidOrder.customer_email || "",
    recipientName: paidOrder.customer_name || "Customer",
    event: "order_confirmed",
    orderId: paidOrder.id,
    orderNumber: paidOrder.order_number,
    totalFormatted: formatINR(paidOrder.total_cents),
    shippingAddress: paidOrder.shipping_address,
    items: (paidOrder.items ?? []).map((it) => ({
      name: it.product_name,
      quantity: it.quantity,
      amount: formatINR(it.total_price_cents),
      dimensions: `${it.width_mm}mm × ${it.height_mm}mm`,
      material: it.material,
    })),
  });

  return { orderNumber: paidOrder.order_number, orderId: paidOrder.id, alreadyPaid: false };
}

/** An abandoned or failed payment: the order is closed and the job can be paid again. */
export async function releaseUnpaidSession(session: Stripe.Checkout.Session, outcome: "cancelled" | "failed"): Promise<void> {
  const orderId = session.metadata?.orderId || session.client_reference_id;
  if (!orderId) return;
  const order = await getOrderById(orderId);
  if (!order || order.payment_status !== "pending" || order.stripe_session_id !== session.id) return;

  unwrap(
    await db().from("orders").update({ payment_status: outcome }).eq("id", order.id).eq("payment_status", "pending"),
    "Release unpaid order"
  );
  if (order.draft_id) {
    const draft = await getDraft(order.draft_id);
    if (draft?.status === "payment_pending") {
      await transitionDraftStatus(draft.id, "proof_approved", { id: "stripe", email: "stripe" }, { reason: `payment ${outcome}` });
      unwrap(await db().from("drafts").update({ order_id: null }).eq("id", draft.id), "Unlink draft");
    }
  }
}
