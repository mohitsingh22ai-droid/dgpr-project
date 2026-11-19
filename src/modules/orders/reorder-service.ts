import crypto from "crypto";
import { db, unwrap } from "@/lib/supabase/server";
import { Order } from "@/types/database";
import { getDraft } from "@/modules/drafts/draft-store";
import { getProductById } from "@/modules/catalog/catalog-store";
import { validateConfiguration } from "@/modules/pricing/pricing-engine";
import { downloadFile, uploadFile } from "@/lib/storage";

/**
 * One-click reorder (PRD § 09): re-places a previous order from its approved
 * artwork without redesigning. A new job is created with the same product,
 * size, material, quantity and artwork, already carrying the previously
 * approved proof (same fingerprint), so the customer goes straight to checkout.
 * Prices are recalculated from today's catalogue at checkout.
 */
export async function createReorderDraft(order: Order, customer: { id: string; email: string }): Promise<{ draftId: string }> {
  if (order.payment_status !== "paid") throw new Error("Only paid orders can be reordered.");
  if (!order.draft_id) throw new Error("This order has no saved artwork to reorder.");

  const source = await getDraft(order.draft_id);
  if (!source) throw new Error("The artwork for this order is no longer available.");

  const product = await getProductById(source.productId);
  if (!product || !product.is_active) throw new Error("This product is no longer available.");
  const problem = validateConfiguration(product, {
    widthMm: source.options.widthMm,
    heightMm: source.options.heightMm,
    materialId: source.options.materialId,
    quantity: source.quantity,
  });
  if (problem) throw new Error(`This job can no longer be produced as ordered: ${problem}`);

  const approvedVersion = order.approved_proof_version ?? source.proofVersion;
  const approvedProof = source.proofs.find((p) => p.version === approvedVersion && p.approvedAt);
  if (!approvedProof) throw new Error("The approved proof for this order could not be found.");

  // Copy stored artwork so the new job is independent of the old one.
  const newId = crypto.randomUUID();
  const copy = async (ref: string | null, label: string) => {
    if (!ref) return null;
    const ext = ref.split(".").pop() || "bin";
    const target = `drafts/${newId}/${label}-${crypto.randomUUID()}.${ext}`;
    const bytes = await downloadFile("artwork", ref);
    await uploadFile("artwork", target, bytes, ext === "csv" ? "text/csv" : "application/octet-stream");
    return target;
  };

  unwrap(
    await db().from("drafts").insert({
      id: newId,
      product_id: source.productId,
      customer_id: customer.id,
      customer_email: customer.email,
      status: "proof_approved",
      options: source.options,
      quantity: source.quantity,
      design_json: source.designJson,
      uploaded_file_path: await copy(source.uploadedFileRef, "artwork"),
      csv_file_path: await copy(source.csvFileRef, "data"),
      proof_version: 1,
    }),
    "Create reorder draft"
  );

  unwrap(
    await db().from("draft_proofs").insert({
      draft_id: newId,
      version: 1,
      status: "approved",
      rendered_url: approvedProof.renderedUrl,
      sha256: approvedProof.sha256Hash,
      approved_by: customer.id,
      approved_by_email: customer.email,
      approved_at: new Date().toISOString(),
      feedback: null,
    }),
    "Copy approved proof"
  );

  unwrap(
    await db().from("draft_events").insert({
      draft_id: newId,
      actor_id: customer.id,
      actor_email: customer.email,
      from_status: null,
      to_status: "proof_approved",
      action: "REORDER_CREATED",
      details: { sourceOrder: order.order_number, sourceDraft: source.id, proofSha256: approvedProof.sha256Hash },
    }),
    "Log reorder"
  );

  return { draftId: newId };
}

