import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { getOrderById, updateOrderStageWithVersion, clearOrderApprovedProof } from "@/modules/orders/order-store";
import { getDraft, generateDraftProof } from "@/modules/drafts/draft-store";
import { supersedeEarlierProofs } from "@/modules/proofs/proofs-store";
import { logAdminAction } from "@/modules/audit/audit-store";
import { safeSendNotificationEmail } from "@/modules/email/email-service";
import { db, unwrap } from "@/lib/supabase/server";

/**
 * Staff issue a revised proof (v+1) for a paid order from its current artwork and
 * move the order ARTWORK → PROOF so the customer can approve it (PRD § 08, § 11).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const order = await getOrderById(id);
    if (!order) return NextResponse.json({ error: `Order '${id}' not found` }, { status: 404 });
    if (!order.draft_id) return NextResponse.json({ error: "This order has no job draft to proof." }, { status: 409 });
    if (order.pipeline_stage !== "ARTWORK") {
      return NextResponse.json({ error: "A revised proof can only be issued while the order is at ARTWORK." }, { status: 409 });
    }

    const draft = await getDraft(order.draft_id);
    if (!draft) return NextResponse.json({ error: "Job draft not found" }, { status: 404 });

    const nextVersion = Math.max(draft.proofVersion, ...draft.proofs.map((p) => p.version)) + 1;
    const proof = await generateDraftProof(draft, nextVersion);
    unwrap(
      await db().from("draft_proofs").insert({
        draft_id: draft.id,
        version: proof.version,
        status: "pending_review",
        rendered_url: proof.renderedUrl,
        sha256: proof.sha256Hash,
      }),
      "Save revised proof"
    );
    unwrap(await db().from("drafts").update({ proof_version: nextVersion }).eq("id", draft.id), "Bump proof version");
    await supersedeEarlierProofs(draft.id, nextVersion);
    // The customer must approve the revised proof before production can resume.
    await clearOrderApprovedProof(order.id);

    const moved = await updateOrderStageWithVersion(order.order_number, "PROOF", "ARTWORK", auth.user.email, `Revised proof v${nextVersion} issued`);
    if (!moved.success) {
      return NextResponse.json({ error: moved.error }, { status: moved.conflict ? 409 : 400 });
    }

    await logAdminAction(auth.user.id, auth.user.email, "pipeline_stage_change", "order", order.order_number, {
      from: "ARTWORK",
      to: "PROOF",
      proofVersion: nextVersion,
    });
    await safeSendNotificationEmail({
      to: order.customer_email || "",
      recipientName: order.customer_name || "Customer",
      event: "proof_ready",
      orderId: order.id,
      orderNumber: order.order_number,
      version: nextVersion,
    });

    return NextResponse.json({ success: true, version: nextVersion, sha256: proof.sha256Hash }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to issue proof";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
