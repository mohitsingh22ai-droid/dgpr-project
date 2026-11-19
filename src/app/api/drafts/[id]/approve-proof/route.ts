import { NextRequest, NextResponse } from "next/server";
import { approveDraftProof, calculateDraftPrice, getDraft, presentDraft } from "@/modules/drafts/draft-store";
import { safeSendNotificationEmail } from "@/modules/email/email-service";
import { authorizeDraft } from "@/lib/draft-access";

/**
 * Formal proof approval by the job's owner. The approver recorded in the
 * approval log is the authenticated caller, never a value from the request body.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const draft = await getDraft(id);
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const access = await authorizeDraft(req, draft);
    if (!access.ok) return access.response;

    const updatedDraft = await approveDraftProof(id, { id: access.actor.id, email: access.actor.email });
    const pricing = await calculateDraftPrice(updatedDraft);

    const approvedProof = updatedDraft.proofs.find((p) => p.version === updatedDraft.proofVersion);
    const recipient = updatedDraft.customerEmail || access.actor.user?.email;
    if (recipient) {
      await safeSendNotificationEmail({
        to: recipient,
        recipientName: access.actor.user?.full_name || "Customer",
        event: "proof_approved",
        orderId: updatedDraft.id,
        orderNumber: updatedDraft.id,
        version: updatedDraft.proofVersion,
        proofHash: approvedProof?.sha256Hash,
      });
    }

    return NextResponse.json({
      success: true,
      draft: await presentDraft(updatedDraft),
      pricing,
      message: `Proof v${updatedDraft.proofVersion} approved. Ready for checkout.`,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to approve proof";
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }
}
