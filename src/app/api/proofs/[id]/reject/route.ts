import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { safeSendNotificationEmail } from "@/modules/email/email-service";
import { getAuthUser } from "@/lib/server-auth";
import { getOrderById, updateOrderStageWithVersion, clearOrderApprovedProof } from "@/modules/orders/order-store";
import { getProofById, getLatestProofForDraft, updateProof } from "@/modules/proofs/proofs-store";

const RejectProofSchema = z.object({
  feedback: z.string().trim().min(3).max(2000),
  orderId: z.string().min(1),
  currentVersion: z.number().int().positive(),
});

/**
 * Customer requests changes to a revised proof on a paid order. The proof is
 * marked changes_requested and the order goes back to ARTWORK for pre-press,
 * who then issue the next version. Production stays locked.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionUser = await getAuthUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized: Valid session required" }, { status: 401 });
    }

    const { id } = await params;
    const validated = RejectProofSchema.safeParse(await req.json().catch(() => null));
    if (!validated.success) {
      return NextResponse.json({ error: "Invalid change request payload", details: validated.error.format() }, { status: 400 });
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
      return NextResponse.json({ error: `This order is not awaiting proof review (stage: ${order.pipeline_stage}).` }, { status: 409 });
    }
    const latest = await getLatestProofForDraft(order.draft_id);
    if (!latest || latest.id !== proof.id || proof.status !== "pending_review") {
      return NextResponse.json({ error: "Changes can only be requested on the latest proof awaiting review." }, { status: 409 });
    }

    const { feedback } = validated.data;
    await updateProof(id, { status: "changes_requested", customer_feedback: feedback });
    await clearOrderApprovedProof(order.id);

    const moved = await updateOrderStageWithVersion(
      order.order_number,
      "ARTWORK",
      "PROOF",
      sessionUser.email,
      `Customer requested changes to proof v${proof.version_number}: ${feedback}`
    );
    if (!moved.success) {
      return NextResponse.json({ error: moved.error || "Could not update the order." }, { status: moved.conflict ? 409 : 400 });
    }

    await safeSendNotificationEmail({
      to: order.customer_email || sessionUser.email,
      recipientName: order.customer_name || "Customer",
      event: "change_requested",
      orderId: order.id,
      orderNumber: order.order_number,
      version: proof.version_number,
      feedback,
    });

    return NextResponse.json({
      success: true,
      proofId: id,
      orderId: order.order_number,
      status: "changes_requested",
      feedback,
      nextVersion: proof.version_number + 1,
      message: `Change request logged. Pre-press will issue proof v${proof.version_number + 1}. Production stays locked.`,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Revision processing error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
