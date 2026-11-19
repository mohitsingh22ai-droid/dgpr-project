import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDraft, updateDraft, transitionDraftStatus, presentDraft } from "@/modules/drafts/draft-store";
import { authorizeDraft } from "@/lib/draft-access";
import { signedUploadUrl, downloadFile, deleteFile } from "@/lib/storage";
import { precheckArtwork, inspectArtwork, fileExtension } from "@/modules/designer/artwork-validation";

/**
 * Finished-artwork upload for a job draft (PRD § 06).
 *
 *   POST  { fileName, sizeBytes }  → one-time signed upload URL (the browser PUTs the file directly)
 *   PUT   { path, fileName }       → server inspects the stored file and attaches it to the draft
 */

const EDITABLE = ["configured", "artwork_ready", "proof_pending"];

const RequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().positive(),
});

const ConfirmSchema = z.object({
  path: z.string().min(1).max(512),
  fileName: z.string().trim().min(1).max(200),
});

async function loadEditableDraft(req: NextRequest, id: string) {
  const draft = await getDraft(id);
  if (!draft) return { error: NextResponse.json({ error: "Draft not found" }, { status: 404 }) };
  const access = await authorizeDraft(req, draft);
  if (!access.ok) return { error: access.response };
  if (!EDITABLE.includes(draft.status)) {
    return { error: NextResponse.json({ error: "This job is approved and its artwork can no longer change." }, { status: 409 }) };
  }
  return { draft, actor: { id: access.actor.id, email: access.actor.email } };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "fileName and sizeBytes are required." }, { status: 400 });

  const problem = precheckArtwork(parsed.data.fileName, parsed.data.sizeBytes);
  if (problem) return NextResponse.json({ error: problem }, { status: 422 });

  const loaded = await loadEditableDraft(req, id);
  if ("error" in loaded) return loaded.error;

  const path = `drafts/${id}/${crypto.randomUUID()}.${fileExtension(parsed.data.fileName)}`;
  const upload = await signedUploadUrl("artwork", path);
  return NextResponse.json({ path: upload.path, signedUrl: upload.signedUrl });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = ConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "path and fileName are required." }, { status: 400 });

  // The path must be one issued for this draft.
  if (!parsed.data.path.startsWith(`drafts/${id}/`) || parsed.data.path.includes("..")) {
    return NextResponse.json({ error: "Invalid upload reference." }, { status: 400 });
  }

  const loaded = await loadEditableDraft(req, id);
  if ("error" in loaded) return loaded.error;
  const { draft, actor } = loaded;

  let bytes: Buffer;
  try {
    bytes = await downloadFile("artwork", parsed.data.path);
  } catch {
    return NextResponse.json({ error: "The upload was not received. Please try again." }, { status: 400 });
  }

  const check = inspectArtwork(new Uint8Array(bytes), parsed.data.fileName, draft.options.widthMm, draft.options.heightMm);
  if (!check.ok) {
    await deleteFile("artwork", parsed.data.path);
    return NextResponse.json({ error: check.error, warnings: check.warnings }, { status: 422 });
  }

  if (draft.status === "configured") {
    await transitionDraftStatus(id, "artwork_ready", actor, { source: "upload" });
  }
  const updated = await updateDraft(
    id,
    {
      uploadedFileRef: parsed.data.path,
      designJson: {
        source: "upload",
        fileName: parsed.data.fileName,
        kind: check.kind,
        contentType: check.contentType,
        sizeBytes: bytes.length,
        pixelWidth: check.pixelWidth,
        pixelHeight: check.pixelHeight,
        effectiveDpi: check.effectiveDpi,
        warnings: check.warnings,
      },
    },
    actor,
    "ARTWORK_UPLOADED"
  );

  return NextResponse.json({ draft: await presentDraft(updated), kind: check.kind, warnings: check.warnings, effectiveDpi: check.effectiveDpi });
}
