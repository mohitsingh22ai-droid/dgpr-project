import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { safeSendNotificationEmail } from "@/modules/email/email-service";
import { getAuthUser } from "@/lib/server-auth";
import { getOrderById, updateOrderStageWithVersion, setOrderApprovedProof } from "@/modules/orders/order-store";
import { getProofById, getLatestProofForDraft, updateProof } from "@/modules/proofs/proofs-store";
import { db, unwrap } from "@/lib/supabase/server";

const ApproveProofSchema = z.object({
  orderId: z.string().min(1),
  version: z.number().int().positive(),
});

/**
 * Customer approval of a REVISED proof on a paid order (PRD § 08).
 *
 * Proofs are normally approved before payment; staff reopen the PROOF stage when
 * artwork must change after payment. Approval is only accepted while the order is
 * at PROOF, for the latest version, by the order's owner. The order then records
 * the approved version + fingerprint and moves to PRODUCTION.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionUser = await getAuthUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized: Valid session required" }, { status: 401 });
    }

    const { id } = await params;
    const validated = ApproveProofSchema.safeParse(await req.json().catch(() => null));
    if (!validated.success) {
      return NextResponse.json({ error: "Invalid approval payload", details: validated.error.format() }, { status: 400 });
    }

    const order = await getOrderById(validated.data.orderId);
    const proof = await getProofById(id);
    if (!order || !proof || proof.order_id !== order.order_number || !order.draft_id) {
      return NextResponse.json({ error: "Proof not found for this order" }, { status: 404 });
    }
    if (sessionUser.role !== "admin" && order.customer_id !== sessionUser.id) {
      return NextResponse.json({ error: "Forbidden: You do not own this order's proof" }, { status: 403 });
    }
    if (order.pipeline_stage !== "PROOF") {
      return NextResponse.json({ error: `This order is not awaiting proof approval (stage: ${order.pipeline_stage}).` }, { status: 409 });
    }

    const latest = await getLatestProofForDraft(order.draft_id);
    if (!latest || latest.id !== proof.id || proof.version_number !== validated.data.version) {
      return NextResponse.json({ error: "Only the latest proof version can be approved." }, { status: 409 });
    }
    if (proof.status !== "pending_review") {
      return NextResponse.json({ error: `This proof is ${proof.status.replace("_", " ")}.` }, { status: 409 });
    }

    const approvedAt = new Date().toISOString();
    await updateProof(id, { status: "approved", approved_by: sessionUser.email, approved_at: approvedAt });
    unwrap(await db().from("draft_proofs").update({ approved_by: sessionUser.id }).eq("id", id), "Record approver");
    await setOrderApprovedProof(order.id, proof.version_number, latest.sha256);

    const moved = await updateOrderStageWithVersion(
      order.order_number,
      "PRODUCTION",
      "PROOF",
      sessionUser.email,
      `Proof v${proof.version_number} approved by ${sessionUser.email}`
    );
    if (!moved.success) {
      return NextResponse.json({ error: moved.error || "Could not advance the order." }, { status: moved.conflict ? 409 : 400 });
    }

    await safeSendNotificationEmail({
      to: order.customer_email || sessionUser.email,
      recipientName: order.customer_name || sessionUser.full_name || "Customer",
      event: "proof_approved",
      orderId: order.id,
      orderNumber: order.order_number,
      version: proof.version_number,
      proofHash: latest.sha256,
    });

    return NextResponse.json({
      success: true,
      proofId: id,
      orderId: order.order_number,
      version: proof.version_number,
      status: "approved",
      approvedBy: sessionUser.email,
      approvedAt,
      message: `Proof v${proof.version_number} approved. Production files are unlocked.`,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Approval processing error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
