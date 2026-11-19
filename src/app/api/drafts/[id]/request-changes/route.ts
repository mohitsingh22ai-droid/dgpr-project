import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestDraftProofChanges, calculateDraftPrice, getDraft, presentDraft } from "@/modules/drafts/draft-store";
import { safeSendNotificationEmail } from "@/modules/email/email-service";
import { authorizeDraft } from "@/lib/draft-access";

const RequestChangesSchema = z.object({
  feedback: z.string().trim().min(1).max(2000).optional(),
});

/** The job's owner asks for a revised proof; a new version is opened for review. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = RequestChangesSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Feedback must be 1–2000 characters." }, { status: 400 });
    }

    const draft = await getDraft(id);
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const access = await authorizeDraft(req, draft);
    if (!access.ok) return access.response;

    const feedback = parsed.data.feedback || "Customer requested revisions to artwork.";
    const actor = { id: access.actor.id, email: access.actor.email };
    const updatedDraft = await requestDraftProofChanges(id, feedback, actor);
    const pricing = await calculateDraftPrice(updatedDraft);

    const recipient = updatedDraft.customerEmail || access.actor.user?.email;
    if (recipient) {
      const recipientName = access.actor.user?.full_name || "Customer";
      await safeSendNotificationEmail({
        to: recipient,
        recipientName,
        event: "change_requested",
        orderId: updatedDraft.id,
        orderNumber: updatedDraft.id,
        version: updatedDraft.proofVersion - 1,
        feedback,
      });
      await safeSendNotificationEmail({
        to: recipient,
        recipientName,
        event: "proof_ready",
        orderId: updatedDraft.id,
        orderNumber: updatedDraft.id,
        version: updatedDraft.proofVersion,
      });
    }

    return NextResponse.json({
      success: true,
      draft: await presentDraft(updatedDraft),
      pricing,
      message: `Changes requested. Revision v${updatedDraft.proofVersion} is ready for review.`,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to request proof changes";
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }
}
