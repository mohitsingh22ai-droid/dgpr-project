import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, finalizePaidSession, releaseUnpaidSession } from "@/modules/orders/payment-service";

/**
 * Stripe webhook. Every event must carry a valid `stripe-signature` for
 * STRIPE_WEBHOOK_SECRET; unsigned or forged requests are rejected and never
 * parsed. Handlers are idempotent, so Stripe retries are safe.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured; refusing the event.");
    return NextResponse.json({ error: "Webhook endpoint is not configured." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === "paid") {
          const result = await finalizePaidSession(session);
          return NextResponse.json({ received: true, orderNumber: result.orderNumber, duplicate: result.alreadyPaid });
        }
        break; // async methods: wait for async_payment_succeeded
      }
      case "checkout.session.expired":
        await releaseUnpaidSession(event.data.object as Stripe.Checkout.Session, "cancelled");
        break;
      case "checkout.session.async_payment_failed":
        await releaseUnpaidSession(event.data.object as Stripe.Checkout.Session, "failed");
        break;
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    // 500 makes Stripe retry later (e.g. transient database error).
    const message = err instanceof Error ? err.message : "Webhook handler error";
    console.error("[stripe-webhook]", event.type, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
