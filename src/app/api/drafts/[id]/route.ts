import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDraft, updateDraft, calculateDraftPrice, transitionDraftStatus, presentDraft } from "@/modules/drafts/draft-store";
import { authorizeDraft } from "@/lib/draft-access";
import { DraftStatus } from "@/types/draft";
import { getAllDivisions, getProductById } from "@/modules/catalog/catalog-store";

export async function GET(
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

    // Optional ?placeOfSupply=<GST state code> prices the job for a delivery state.
    const pos = req.nextUrl.searchParams.get("placeOfSupply");
    const [pricing, product, divisions] = await Promise.all([
      calculateDraftPrice(draft, pos && /^\d{2}$/.test(pos) ? pos : null),
      getProductById(draft.productId),
      getAllDivisions(),
    ]);
    const division = divisions.find((d) => d.id === product?.division_id) ?? null;

    return NextResponse.json({ draft: await presentDraft(draft), pricing, product, division });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to load draft";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

const PatchDraftSchema = z
  .object({
    updates: z
      .object({
        designJson: z.record(z.unknown()).nullable().optional(),
        uploadedFileRef: z.string().max(1024).nullable().optional(),
        csvFileRef: z.string().max(1024).nullable().optional(),
        status: z.literal("proof_pending").optional(),
      })
      .strict(),
    action: z.enum(["DRAFT_UPDATED", "ARTWORK_SAVED", "PROOF_GENERATED", "PROOF_PENDING_BEFORE_APPROVAL"]).optional(),
  })
  .passthrough();

const EDITABLE_STATUSES: DraftStatus[] = ["configured", "artwork_ready", "proof_pending"];

/**
 * Saves artwork on a draft and (optionally) submits it for proof review.
 *
 * Only artwork fields can be written. Status can only move forward to
 * proof_pending through the state machine; quantity, size, owner, proofs and
 * approval are never writable here. Approved or paid jobs are read-only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = PatchDraftSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Only artwork fields can be updated on a job draft.", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const draft = await getDraft(id);
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const access = await authorizeDraft(req, draft);
    if (!access.ok) return access.response;

    if (!EDITABLE_STATUSES.includes(draft.status)) {
      return NextResponse.json(
        { error: `This job is ${draft.status.replace("_", " ")} and can no longer be edited. Request changes on the proof instead.` },
        { status: 409 }
      );
    }

    const { status: requestedStatus, ...artwork } = parsed.data.updates;
    const actor = { id: access.actor.id, email: access.actor.email };

    // configured → artwork_ready → proof_pending, recorded step by step.
    if (requestedStatus === "proof_pending" && draft.status === "configured") {
      await transitionDraftStatus(id, "artwork_ready", actor);
    }

    const updated = await updateDraft(
      id,
      { ...artwork, ...(requestedStatus ? { status: requestedStatus } : {}) },
      actor,
      parsed.data.action || "DRAFT_UPDATED"
    );
    const pricing = await calculateDraftPrice(updated);

    return NextResponse.json({ draft: await presentDraft(updated), pricing });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to update draft";
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }
}
