import crypto from "crypto";
import { db, unwrap } from "@/lib/supabase/server";
import { JobDraft, DraftStatus, DraftAuditLogEntry, DraftProofRecord, DraftOptions } from "@/types/draft";
import { DivisionSlug } from "@/types/database";
import { calculatePrintPrice, PricingBreakdown, PricingValidationError, validateConfiguration } from "@/modules/pricing/pricing-engine";
import { generateWatermarkedProofSvg } from "@/modules/proofs/proof-generator";
import { renderDesignFragment, isCanvasState } from "@/modules/proofs/design-render";
import { downloadFile, uploadFile, resolveStoredUrl, STORAGE_PREFIX } from "@/lib/storage";
import { ExtendedProduct, getProductById } from "@/modules/catalog/catalog-store";

/**
 * Job draft repository (public.drafts + draft_proofs + draft_events).
 *
 * Customer journey state machine:
 *   configured → artwork_ready → proof_pending → proof_approved → payment_pending → paid
 * A change request returns to proof_pending with a new version; a failed or
 * abandoned payment returns to proof_approved.
 */
const VALID_TRANSITIONS: Record<DraftStatus, DraftStatus[]> = {
  configured: ["artwork_ready"],
  artwork_ready: ["proof_pending", "configured"],
  proof_pending: ["proof_approved", "proof_pending", "artwork_ready"],
  proof_approved: ["payment_pending", "proof_pending"],
  payment_pending: ["paid", "proof_approved"],
  paid: [],
};

export function canTransition(from: DraftStatus, to: DraftStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Actor = { id: string; email: string };

interface DraftRow {
  id: string;
  product_id: string;
  customer_id: string | null;
  customer_email: string | null;
  status: DraftStatus;
  options: DraftOptions;
  quantity: number;
  design_json: Record<string, unknown> | null;
  uploaded_file_path: string | null;
  csv_file_path: string | null;
  proof_version: number;
  order_id: string | null;
  created_at: string;
  updated_at: string;
  products: { slug: string; name: string; divisions: { slug: DivisionSlug } | null } | null;
  draft_proofs: Array<{
    version: number;
    status: string;
    rendered_url: string;
    sha256: string;
    feedback: string | null;
    approved_by_email: string | null;
    approved_at: string | null;
    created_at: string;
  }>;
  draft_events: Array<{
    id: string;
    actor_id: string;
    actor_email: string;
    from_status: DraftStatus | null;
    to_status: DraftStatus | null;
    action: string;
    details: Record<string, unknown>;
    created_at: string;
  }>;
}

const DRAFT_COLUMNS =
  "*, products(slug, name, divisions(slug)), draft_proofs(*), draft_events(*)";

function toDraft(row: DraftRow): JobDraft {
  const proofs: DraftProofRecord[] = [...(row.draft_proofs ?? [])]
    .sort((a, b) => a.version - b.version)
    .map((p) => ({
      version: p.version,
      renderedUrl: p.rendered_url,
      sha256Hash: p.sha256,
      createdAt: p.created_at,
      approvedBy: p.approved_by_email,
      approvedAt: p.approved_at,
      feedback: p.feedback,
    }));

  const auditLog: DraftAuditLogEntry[] = [...(row.draft_events ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((e) => ({
      id: e.id,
      timestamp: e.created_at,
      actorId: e.actor_id,
      actorEmail: e.actor_email,
      fromStatus: (e.from_status ?? row.status) as DraftStatus,
      toStatus: (e.to_status ?? row.status) as DraftStatus,
      action: e.action,
      details: e.details,
    }));

  return {
    id: row.id,
    productId: row.product_id,
    productSlug: row.products?.slug ?? "",
    productName: row.products?.name ?? "",
    divisionSlug: (row.products?.divisions?.slug ?? "labels-stickers") as DivisionSlug,
    options: row.options,
    quantity: row.quantity,
    designJson: row.design_json,
    uploadedFileRef: row.uploaded_file_path,
    csvFileRef: row.csv_file_path,
    proofVersion: row.proof_version,
    proofs,
    status: row.status,
    customerId: row.customer_id,
    customerEmail: row.customer_email,
    orderId: row.order_id,
    auditLog,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function logEvent(
  draftId: string,
  actor: Actor,
  action: string,
  fromStatus: DraftStatus | null,
  toStatus: DraftStatus | null,
  details: Record<string, unknown> = {}
): Promise<void> {
  unwrap(
    await db().from("draft_events").insert({
      draft_id: draftId,
      actor_id: actor.id,
      actor_email: actor.email,
      from_status: fromStatus,
      to_status: toStatus,
      action,
      details,
    }),
    "Log draft event"
  );
}

export interface CreateDraftInput {
  productId: string;
  widthMm: number;
  heightMm: number;
  materialId: string;
  quantity: number;
  orientation?: "portrait" | "landscape" | "square";
  customerId?: string | null;
  customerEmail?: string | null;
  /** SHA-256 of the creating visitor's guest cookie; used when there is no customer. */
  guestTokenHash?: string | null;
}

export async function createDraft(input: CreateDraftInput): Promise<JobDraft> {
  const product = await getProductById(input.productId);
  if (!product || !product.is_active) {
    throw new Error(`Product '${input.productId}' not found`);
  }
  const problem = validateConfiguration(product, input);
  if (problem) throw new PricingValidationError(problem);

  const row = unwrap(
    await db()
      .from("drafts")
      .insert({
        product_id: product.id,
        customer_id: input.customerId || null,
        customer_email: input.customerEmail || null,
        guest_token_hash: input.customerId ? null : input.guestTokenHash || null,
        status: "configured",
        quantity: input.quantity,
        options: {
          widthMm: input.widthMm,
          heightMm: input.heightMm,
          materialId: input.materialId,
          orientation: input.orientation || "landscape",
          bleedMm: product.default_bleed_mm,
          safetyMarginMm: product.default_safety_margin_mm,
        },
      })
      .select("id")
      .single(),
    "Create draft"
  ) as { id: string };

  await logEvent(
    row.id,
    { id: input.customerId || "anonymous", email: input.customerEmail || "anonymous@guest.local" },
    "DRAFT_CREATED",
    "configured",
    "configured",
    {
      productId: product.id,
      dimensions: `${input.widthMm}x${input.heightMm}mm`,
      quantity: input.quantity,
      materialId: input.materialId,
    }
  );

  return (await getDraft(row.id))!;
}

export async function getDraft(draftId: string): Promise<JobDraft | null> {
  if (!UUID_RE.test(draftId)) return null;
  const row = unwrap(
    await db().from("drafts").select(DRAFT_COLUMNS).eq("id", draftId).maybeSingle(),
    "Load draft"
  );
  return row ? toDraft(row as unknown as DraftRow) : null;
}

/** Maps JobDraft field updates onto draft columns. */
function toDraftColumns(updates: Partial<JobDraft>): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  if (updates.status !== undefined) columns.status = updates.status;
  if (updates.options !== undefined) columns.options = updates.options;
  if (updates.quantity !== undefined) columns.quantity = updates.quantity;
  if (updates.designJson !== undefined) columns.design_json = updates.designJson;
  if (updates.uploadedFileRef !== undefined) columns.uploaded_file_path = updates.uploadedFileRef;
  if (updates.csvFileRef !== undefined) columns.csv_file_path = updates.csvFileRef;
  if (updates.proofVersion !== undefined) columns.proof_version = updates.proofVersion;
  if (updates.customerId !== undefined) columns.customer_id = updates.customerId;
  if (updates.customerEmail !== undefined) columns.customer_email = updates.customerEmail;
  if (updates.orderId !== undefined) columns.order_id = updates.orderId;
  return columns;
}

async function saveProofRecord(draftId: string, proof: DraftProofRecord): Promise<void> {
  unwrap(
    await db().from("draft_proofs").upsert(
      {
        draft_id: draftId,
        version: proof.version,
        rendered_url: proof.renderedUrl,
        sha256: proof.sha256Hash,
        feedback: proof.feedback ?? null,
        approved_by_email: proof.approvedBy ?? null,
        approved_at: proof.approvedAt ?? null,
        status: proof.approvedAt ? "approved" : proof.feedback ? "changes_requested" : "pending_review",
      },
      { onConflict: "draft_id,version" }
    ),
    "Save proof"
  );
}

export async function updateDraft(
  draftId: string,
  updates: Partial<JobDraft>,
  actor: Actor,
  actionLabel = "DRAFT_UPDATED"
): Promise<JobDraft> {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error(`Draft ${draftId} not found`);

  const columns = toDraftColumns(updates);
  if (Object.keys(columns).length > 0) {
    unwrap(await db().from("drafts").update(columns).eq("id", draftId), "Update draft");
  }
  await logEvent(draftId, actor, actionLabel, draft.status, updates.status ?? draft.status, {
    updates: Object.keys(updates),
  });

  // Generate the first stored proof when the draft first reaches proof review.
  if ((actionLabel === "PROOF_GENERATED" || updates.status === "proof_pending") && draft.proofs.length === 0) {
    const updated = (await getDraft(draftId))!;
    const proof = await generateDraftProof(updated, updated.proofVersion || 1);
    await saveProofRecord(draftId, proof);
  }

  return (await getDraft(draftId))!;
}

export async function transitionDraftStatus(
  draftId: string,
  newStatus: DraftStatus,
  actor: Actor,
  details?: Record<string, unknown>
): Promise<JobDraft> {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error(`Draft ${draftId} not found`);

  if (draft.status !== newStatus && !canTransition(draft.status, newStatus)) {
    throw new Error(
      `Illegal workflow transition: Cannot move draft ${draftId} from "${draft.status}" to "${newStatus}". Proof must be approved before payment.`
    );
  }

  // Compare-and-set on the current status so concurrent transitions cannot both win.
  const updated = unwrap(
    await db().from("drafts").update({ status: newStatus }).eq("id", draftId).eq("status", draft.status).select("id"),
    "Transition draft"
  ) as Array<{ id: string }>;
  if (updated.length === 0) {
    throw new Error(`Draft ${draftId} changed concurrently; please retry.`);
  }

  await logEvent(draftId, actor, `STATUS_TRANSITION_${newStatus.toUpperCase()}`, draft.status, newStatus, details);
  return (await getDraft(draftId))!;
}

/**
 * Renders, stores and fingerprints the proof for a draft version (§ 06, § 08).
 *
 * The SVG shows the customer's actual artwork (designer canvas, or uploaded PNG/SVG);
 * PDF/AI/EPS uploads get a labelled placeholder because they are checked by
 * pre-press. The SHA-256 covers the rendered proof, the job configuration and the
 * uploaded file bytes, so the approval log identifies exactly what was approved.
 */
export async function generateDraftProof(
  draft: JobDraft,
  version?: number,
  productOverride?: ExtendedProduct
): Promise<DraftProofRecord> {
  const currentVersion = version || draft.proofVersion || 1;
  const product = productOverride ?? (await getProductById(draft.productId));
  const material =
    product?.allowed_materials.find((m) => m.id === draft.options.materialId) ?? product?.allowed_materials[0];

  const { widthMm, heightMm, bleedMm } = draft.options;
  let artworkFragment: string | undefined;
  let placeholder: string | undefined;
  let uploadHash = "";

  if (draft.uploadedFileRef) {
    const meta = (draft.designJson ?? {}) as { kind?: string; fileName?: string; contentType?: string };
    const bytes = await downloadFile("artwork", draft.uploadedFileRef);
    uploadHash = crypto.createHash("sha256").update(bytes).digest("hex");
    if (meta.kind === "png" || meta.kind === "svg") {
      const href = `data:${meta.contentType};base64,${bytes.toString("base64")}`;
      artworkFragment = `<image x="0" y="0" width="${widthMm + 2 * bleedMm}" height="${heightMm + 2 * bleedMm}" preserveAspectRatio="xMidYMid meet" href="${href}"/>`;
    } else {
      placeholder = `${(meta.kind || "file").toUpperCase()} artwork: ${meta.fileName || "uploaded file"} (checked by pre-press)`;
    }
  } else if (isCanvasState(draft.designJson)) {
    artworkFragment = renderDesignFragment(draft.designJson);
  } else {
    placeholder = "No artwork yet";
  }

  const createdAt = new Date().toISOString();
  const svg = generateWatermarkedProofSvg(
    {
      version: currentVersion,
      widthMm,
      heightMm,
      bleedMm,
      materialName: material?.name ?? draft.options.materialId,
      productName: product?.name,
      orderNumber: draft.id,
      createdAt,
    },
    artworkFragment,
    placeholder
  );

  const fingerprint = crypto
    .createHash("sha256")
    .update(svg)
    .update(JSON.stringify({ product: draft.productId, options: draft.options, quantity: draft.quantity }))
    .update(uploadHash)
    .digest("hex");

  const path = `drafts/${draft.id}/v${currentVersion}-${fingerprint.slice(0, 12)}.svg`;
  await uploadFile("proofs", path, Buffer.from(svg, "utf8"), "image/svg+xml");

  return {
    version: currentVersion,
    renderedUrl: `${STORAGE_PREFIX}proofs/${path}`,
    sha256Hash: fingerprint,
    createdAt,
  };
}

export async function approveDraftProof(draftId: string, actor: Actor): Promise<JobDraft> {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error(`Draft ${draftId} not found`);
  if (draft.status !== "proof_pending") {
    throw new Error(
      draft.status === "proof_approved"
        ? `Proof v${draft.proofVersion} is already approved.`
        : `A proof can only be approved while it is awaiting review (current status: ${draft.status}).`
    );
  }

  const activeProof =
    draft.proofs.find((p) => p.version === draft.proofVersion) ?? (await generateDraftProof(draft, draft.proofVersion));
  const now = new Date().toISOString();

  await saveProofRecord(draftId, { ...activeProof, approvedBy: actor.email, approvedAt: now });
  const approved = unwrap(
    await db().from("drafts").update({ status: "proof_approved" }).eq("id", draftId).eq("status", "proof_pending").select("id"),
    "Approve proof"
  ) as Array<{ id: string }>;
  if (approved.length === 0) throw new Error(`Draft ${draftId} changed concurrently; please retry.`);
  await logEvent(draftId, actor, "PROOF_APPROVED", draft.status, "proof_approved", {
    version: draft.proofVersion,
    sha256Hash: activeProof.sha256Hash,
    approvedBy: actor.email,
  });

  return (await getDraft(draftId))!;
}

export async function requestDraftProofChanges(draftId: string, feedback: string, actor: Actor): Promise<JobDraft> {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error(`Draft ${draftId} not found`);
  if (draft.status !== "proof_pending" && draft.status !== "proof_approved") {
    throw new Error(`Changes can only be requested on a proof under review or approved but unpaid (current status: ${draft.status}).`);
  }

  const current = draft.proofs.find((p) => p.version === draft.proofVersion) ?? {
    version: draft.proofVersion,
    renderedUrl: "",
    sha256Hash: "",
    createdAt: new Date().toISOString(),
  };
  await saveProofRecord(draftId, { ...current, feedback });

  const nextVersion = draft.proofVersion + 1;
  await saveProofRecord(draftId, await generateDraftProof(draft, nextVersion));

  unwrap(
    await db().from("drafts").update({ status: "proof_pending", proof_version: nextVersion }).eq("id", draftId),
    "Request changes"
  );
  await logEvent(draftId, actor, "PROOF_CHANGES_REQUESTED", draft.status, "proof_pending", {
    previousVersion: draft.proofVersion,
    newVersion: nextVersion,
    feedback,
  });

  return (await getDraft(draftId))!;
}

/** Server-only: the stored guest-token hash of a draft (never exposed in API responses). */
export async function getDraftGuestTokenHash(draftId: string): Promise<string | null> {
  if (!UUID_RE.test(draftId)) return null;
  const row = unwrap(
    await db().from("drafts").select("guest_token_hash").eq("id", draftId).maybeSingle(),
    "Load draft owner"
  ) as { guest_token_hash: string | null } | null;
  return row?.guest_token_hash ?? null;
}

export async function attachDraftToUser(draftId: string, userId: string, userEmail: string): Promise<JobDraft> {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error(`Draft ${draftId} not found`);
  if (draft.customerId && draft.customerId !== userId) {
    throw new Error("This job already belongs to another account.");
  }

  unwrap(
    await db()
      .from("drafts")
      .update({ customer_id: userId, customer_email: userEmail, guest_token_hash: null })
      .eq("id", draftId),
    "Attach draft"
  );
  await logEvent(draftId, { id: userId, email: userEmail }, "DRAFT_ATTACHED_TO_USER", draft.status, draft.status, {
    userId,
    userEmail,
  });
  return (await getDraft(draftId))!;
}

/** Server-authoritative price for a draft, recalculated from the catalogue. */
export async function calculateDraftPrice(draft: JobDraft, placeOfSupply?: string | null): Promise<PricingBreakdown> {
  const product = await getProductById(draft.productId);
  if (!product) throw new Error(`Product '${draft.productId}' for draft ${draft.id} no longer exists`);
  return calculatePrintPrice({
    product,
    widthMm: draft.options.widthMm,
    heightMm: draft.options.heightMm,
    materialId: draft.options.materialId,
    quantity: draft.quantity,
    placeOfSupply,
  });
}

/** API view of a draft: stored proof references become short-lived URLs. */
export async function presentDraft(draft: JobDraft): Promise<JobDraft> {
  const proofs = await Promise.all(
    draft.proofs.map(async (p) => ({ ...p, renderedUrl: await resolveStoredUrl(p.renderedUrl) }))
  );
  return { ...draft, proofs };
}
