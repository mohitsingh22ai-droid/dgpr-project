import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/server-auth";
import { authorizeDraft } from "@/lib/draft-access";
import { db, unwrap } from "@/lib/supabase/server";
import { getDraft, calculateDraftPrice, transitionDraftStatus, attachDraftToUser } from "@/modules/drafts/draft-store";
import { getProductById } from "@/modules/catalog/catalog-store";
import { createOrder, getOrderById, reserveOrderNumber, NewOrderItem } from "@/modules/orders/order-store";
import { isValidPinCode, isValidStateCode, stateName } from "@/modules/pricing/gst";
import { stripe } from "@/modules/orders/payment-service";
import { Order } from "@/types/database";

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const CheckoutSchema = z.object({
  draftId: z.string().uuid("A valid job is required for checkout"),
  customerName: z.string().trim().min(2, "Enter the recipient's name").max(120),
  phone: z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || GSTIN_RE.test(v), "Enter a valid 15-character GSTIN"),
  shippingAddress: z.object({
    line1: z.string().trim().min(3, "Address line 1 is required").max(200),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(2, "City is required").max(80),
    stateCode: z.string().refine(isValidStateCode, "Select a state"),
    postalCode: z.string().trim().refine(isValidPinCode, "Enter a valid 6-digit PIN code"),
  }),
});

/**
 * Starts payment for an approved job (PRD § 05).
 *
 * 1. Caller must be signed in and own the job; the proof must be approved.
 * 2. The price is recalculated on the server with GST for the delivery state.
 * 3. A pending order (stage QUOTE) is created, or the job's pending order is reused.
 * 4. A Stripe Checkout Session is created and its URL returned. The order is only
 *    marked paid when Stripe confirms the payment (webhook or session check).
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = CheckoutSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid checkout request.", details: parsed.error.format() },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Please sign in to place your order." }, { status: 401 });
    }

    const draft = await getDraft(input.draftId);
    if (!draft) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const access = await authorizeDraft(req, draft);
    if (!access.ok || (draft.customerId && draft.customerId !== user.id)) {
      return NextResponse.json({ error: "Forbidden: this job belongs to another account." }, { status: 403 });
    }

    if (draft.status !== "proof_approved" && draft.status !== "payment_pending") {
      return NextResponse.json(
        {
          error: `Approval Gate Rejection: this job is "${draft.status}". The proof must be approved before payment.`,
          code: "PROOF_NOT_APPROVED",
          currentStatus: draft.status,
        },
        { status: 400 }
      );
    }
    if (!draft.customerId) {
      await attachDraftToUser(draft.id, user.id, user.email);
    }

    const product = await getProductById(draft.productId);
    if (!product || !product.is_active) {
      return NextResponse.json({ error: "This product is no longer available." }, { status: 409 });
    }
    const approvedProof = draft.proofs.find((p) => p.version === draft.proofVersion && p.approvedAt);
    if (!approvedProof) {
      return NextResponse.json({ error: "The approved proof could not be found.", code: "PROOF_NOT_APPROVED" }, { status: 400 });
    }

    const placeOfSupply = input.shippingAddress.stateCode;
    const pricing = await calculateDraftPrice(draft, placeOfSupply);
    const actor = { id: user.id, email: user.email };

    // Reuse the job's unpaid order on a retry; otherwise create a new pending order.
    let order: Order | null = draft.orderId ? await getOrderById(draft.orderId) : null;
    if (order && order.payment_status !== "pending") order = null;

    const shipping = {
      name: input.customerName,
      line1: input.shippingAddress.line1,
      line2: input.shippingAddress.line2 || undefined,
      city: input.shippingAddress.city,
      state: stateName(placeOfSupply),
      state_code: placeOfSupply,
      postal_code: input.shippingAddress.postalCode.replace(/\s+/g, ""),
      country: "India",
      phone: input.phone,
    };

    if (order) {
      // Address or state may have changed: refresh the stored totals and contact details.
      unwrap(
        await db()
          .from("orders")
          .update({
            customer_name: input.customerName,
            customer_gstin: input.gstin ?? null,
            shipping_address: shipping,
            place_of_supply: placeOfSupply,
            subtotal_paise: pricing.subtotalCents,
            cgst_paise: pricing.cgstCents,
            sgst_paise: pricing.sgstCents,
            igst_paise: pricing.igstCents,
            tax_paise: pricing.taxCents,
            total_paise: pricing.totalCents,
          })
          .eq("id", order.id)
          .eq("payment_status", "pending"),
        "Refresh pending order"
      );
      order = await getOrderById(order.id);
    } else {
      const material = product.allowed_materials.find((m) => m.id === draft.options.materialId);
      const items: NewOrderItem[] = [
        {
          product_id: product.id,
          product_name: product.name,
          division_slug: product.division_slug,
          hsn_code: product.hsn_code,
          width_mm: draft.options.widthMm,
          height_mm: draft.options.heightMm,
          material_id: draft.options.materialId,
          material_name: material?.name ?? pricing.materialName,
          quantity: draft.quantity,
          unit_price_cents: pricing.discountedUnitPriceCents,
          total_price_cents: pricing.subtotalCents,
          gst_rate: pricing.gstRatePercentage,
          artwork_type: draft.uploadedFileRef ? "upload" : "designer",
          design_json: draft.designJson,
          uploaded_file_path: draft.uploadedFileRef,
        },
      ];
      const created = await createOrder(
        {
          id: "",
          order_number: await reserveOrderNumber(),
          customer_id: user.id,
          customer_email: user.email,
          customer_name: input.customerName,
          customer_gstin: input.gstin ?? null,
          pipeline_stage: "QUOTE",
          payment_status: "pending",
          subtotal_cents: pricing.subtotalCents,
          cgst_cents: pricing.cgstCents,
          sgst_cents: pricing.sgstCents,
          igst_cents: pricing.igstCents,
          tax_cents: pricing.taxCents,
          total_cents: pricing.totalCents,
          currency: "INR",
          division_slug: product.division_slug,
          place_of_supply: placeOfSupply,
          shipping_address: shipping,
          draft_id: draft.id,
          approved_proof_version: approvedProof.version,
          created_at: "",
          updated_at: "",
        },
        items
      );
      order = created.order;
      unwrap(
        await db().from("orders").update({ approved_proof_sha256: approvedProof.sha256Hash }).eq("id", order.id),
        "Record approved proof fingerprint"
      );
      unwrap(await db().from("drafts").update({ order_id: order.id }).eq("id", draft.id), "Link draft to order");
      if (draft.status === "proof_approved") {
        await transitionDraftStatus(draft.id, "payment_pending", actor, { orderNumber: order.order_number });
      }
    }
    if (!order) throw new Error("Order could not be prepared.");

    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        currency: "inr",
        customer_email: user.email,
        client_reference_id: order.id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "inr",
              unit_amount: order.total_cents,
              product_data: {
                name: `${product.name} × ${draft.quantity}`,
                description: `${draft.options.widthMm}×${draft.options.heightMm}mm · ${pricing.materialName} · incl. GST ${pricing.gstRatePercentage}% · Order ${order.order_number}`,
              },
            },
          },
        ],
        metadata: { orderId: order.id, orderNumber: order.order_number, draftId: draft.id, customerId: user.id },
        payment_intent_data: { metadata: { orderId: order.id, orderNumber: order.order_number } },
        success_url: `${origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/checkout?draft=${draft.id}&cancelled=1`,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      },
      { idempotencyKey: `checkout:${order.id}:${order.total_cents}:${Date.now() >> 16}` }
    );

    unwrap(await db().from("orders").update({ stripe_session_id: session.id }).eq("id", order.id), "Store checkout session");

    return NextResponse.json({ checkoutUrl: session.url, sessionId: session.id, orderNumber: order.order_number, pricing });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Checkout could not be started";
    console.error("[checkout]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
