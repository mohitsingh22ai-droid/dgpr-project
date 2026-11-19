import { db, unwrap } from "@/lib/supabase/server";
import { Proof, ProofStatus } from "@/types/database";

/**
 * Proof repository over public.draft_proofs.
 *
 * Every proof belongs to a job draft; once the draft is paid its order carries
 * `draft_id`, so the same versioned proofs serve the customer dashboard, the
 * approval gate and the admin console. `order_id` on the returned Proof is the
 * order number when the draft has been ordered, otherwise the draft id.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProofRow {
  id: string;
  draft_id: string;
  version: number;
  status: ProofStatus | "superseded";
  rendered_url: string;
  feedback: string | null;
  approved_by_email: string | null;
  approved_at: string | null;
  created_at: string;
  drafts: { customer_id: string | null; orders: { order_number: string } | null } | null;
}

const PROOF_COLUMNS = "*, drafts!inner(customer_id, orders:orders!drafts_order_fk(order_number))";

function toProof(row: ProofRow): Proof {
  return {
    id: row.id,
    order_item_id: row.draft_id,
    order_id: row.drafts?.orders?.order_number ?? row.draft_id,
    version_number: row.version,
    status: (row.status === "superseded" ? "changes_requested" : row.status) as ProofStatus,
    watermarked_preview_url: row.rendered_url,
    customer_feedback: row.feedback,
    approved_by: row.approved_by_email,
    approved_at: row.approved_at,
    created_at: row.created_at,
  };
}

/** Proofs visible to a user: their own drafts' proofs, or all proofs for admins. */
export async function getProofsForUser(userId: string, role: string = "customer"): Promise<Proof[]> {
  let query = db().from("draft_proofs").select(PROOF_COLUMNS).order("created_at", { ascending: false });
  if (role !== "admin") {
    if (!userId || !UUID_RE.test(userId)) return [];
    query = query.eq("drafts.customer_id", userId);
  }
  const rows = unwrap(await query, "Load proofs");
  return (rows as unknown as ProofRow[]).map(toProof);
}

export async function getProofById(id: string): Promise<(Proof & { customer_id: string | null }) | null> {
  if (!UUID_RE.test(id)) return null;
  const row = unwrap(await db().from("draft_proofs").select(PROOF_COLUMNS).eq("id", id).maybeSingle(), "Load proof") as
    | ProofRow
    | null;
  return row ? { ...toProof(row), customer_id: row.drafts?.customer_id ?? null } : null;
}

export async function updateProof(
  id: string,
  updates: Partial<Pick<Proof, "status" | "approved_by" | "approved_at" | "customer_feedback">>
): Promise<Proof | null> {
  if (!UUID_RE.test(id)) return null;
  const columns: Record<string, unknown> = {};
  if (updates.status !== undefined) columns.status = updates.status;
  if (updates.approved_by !== undefined) columns.approved_by_email = updates.approved_by;
  if (updates.approved_at !== undefined) columns.approved_at = updates.approved_at;
  if (updates.customer_feedback !== undefined) columns.feedback = updates.customer_feedback;

  unwrap(await db().from("draft_proofs").update(columns).eq("id", id), "Update proof");
  return getProofById(id);
}

/** Latest proof version for a draft, or null. */
export async function getLatestProofForDraft(draftId: string): Promise<(Proof & { sha256: string }) | null> {
  if (!UUID_RE.test(draftId)) return null;
  const row = unwrap(
    await db().from("draft_proofs").select(`${PROOF_COLUMNS}, sha256`).eq("draft_id", draftId).order("version", { ascending: false }).limit(1).maybeSingle(),
    "Load latest proof"
  ) as (ProofRow & { sha256: string }) | null;
  return row ? { ...toProof(row), sha256: row.sha256 } : null;
}

/** Marks every earlier version of a draft's proofs as superseded. */
export async function supersedeEarlierProofs(draftId: string, latestVersion: number): Promise<void> {
  unwrap(
    await db().from("draft_proofs").update({ status: "superseded" }).eq("draft_id", draftId).lt("version", latestVersion).neq("status", "approved"),
    "Supersede proofs"
  );
}
