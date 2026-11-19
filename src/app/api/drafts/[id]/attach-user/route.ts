import { NextRequest, NextResponse } from "next/server";
import { attachDraftToUser, getDraft, presentDraft } from "@/modules/drafts/draft-store";
import { getAuthUser } from "@/lib/server-auth";
import { authorizeDraft } from "@/lib/draft-access";

/**
 * Moves a guest draft into the signed-in customer's account after login/sign-up.
 * The account is the authenticated caller; the caller must also hold the guest
 * cookie the draft was created with. Body fields are ignored.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: sign in to save this job to your account." }, { status: 401 });
    }

    const { id } = await params;
    const draft = await getDraft(id);
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    if (draft.customerId === user.id) {
      return NextResponse.json({ success: true, draft: await presentDraft(draft) });
    }
    if (draft.customerId) {
      return NextResponse.json({ error: "Forbidden: this job belongs to another account." }, { status: 403 });
    }

    const access = await authorizeDraft(req, draft);
    if (!access.ok) return access.response;

    const updatedDraft = await attachDraftToUser(id, user.id, user.email);
    return NextResponse.json({ success: true, draft: await presentDraft(updatedDraft) });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to attach draft to user";
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }
}
