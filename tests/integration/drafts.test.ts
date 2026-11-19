import { describe, it, after } from "node:test";
import assert from "node:assert";
import { hasDatabase, createTestCustomer, cleanupAccounts } from "./helpers";
import {
  createDraft,
  getDraft,
  transitionDraftStatus,
  approveDraftProof,
  requestDraftProofChanges,
  attachDraftToUser,
  calculateDraftPrice,
} from "@/modules/drafts/draft-store";
import { db } from "@/lib/supabase/server";

const ACTOR = { id: "test-actor", email: "actor@e2e.w2p.test" };
const created: string[] = [];

/** Moves a fresh draft to proof_pending the way the designer does. */
async function toReview(id: string) {
  await transitionDraftStatus(id, "artwork_ready", ACTOR);
  await transitionDraftStatus(id, "proof_pending", ACTOR);
}

async function newDraft(customerId?: string) {
  const draft = await createDraft({
    productId: "prod-vinyl-sticker",
    widthMm: 100,
    heightMm: 80,
    materialId: "gloss-white",
    quantity: 150,
    customerId,
  });
  created.push(draft.id);
  return draft;
}

describe("Job drafts (§ 01, § 05, § 06, § 08)", { skip: !hasDatabase }, () => {
  after(async () => {
    if (created.length) await db().from("drafts").delete().in("id", created);
    await cleanupAccounts();
  });

  it("creates a configured draft with a creation event and catalogue defaults", async () => {
    const draft = await newDraft();
    assert.strictEqual(draft.status, "configured");
    assert.strictEqual(draft.productSlug, "custom-die-cut-vinyl");
    assert.strictEqual(draft.divisionSlug, "labels-stickers");
    assert.strictEqual(draft.options.bleedMm, 3);
    assert.strictEqual(draft.auditLog.length, 1);
    assert.strictEqual(draft.auditLog[0].action, "DRAFT_CREATED");
  });

  it("refuses unknown products instead of falling back to another product", async () => {
    await assert.rejects(
      createDraft({ productId: "no-such-product", widthMm: 50, heightMm: 50, materialId: "x", quantity: 1 }),
      /not found/
    );
  });

  it("returns null for unknown or malformed draft ids", async () => {
    assert.strictEqual(await getDraft("not-a-uuid"), null);
    assert.strictEqual(await getDraft("00000000-0000-0000-0000-000000000000"), null);
  });

  it("enforces the transition rules and records each step", async () => {
    const draft = await newDraft();
    await assert.rejects(transitionDraftStatus(draft.id, "payment_pending", ACTOR), /Illegal workflow transition/);

    await transitionDraftStatus(draft.id, "artwork_ready", ACTOR);
    const pending = await transitionDraftStatus(draft.id, "proof_pending", ACTOR);
    assert.strictEqual(pending.status, "proof_pending");
    assert.deepStrictEqual(
      pending.auditLog.map((e) => e.action),
      ["DRAFT_CREATED", "STATUS_TRANSITION_ARTWORK_READY", "STATUS_TRANSITION_PROOF_PENDING"]
    );
  });

  it("records who approved which proof version, when, and its hash", async () => {
    const draft = await newDraft();
    await assert.rejects(approveDraftProof(draft.id, ACTOR), /awaiting review/);
    await toReview(draft.id);
    const approved = await approveDraftProof(draft.id, ACTOR);
    assert.strictEqual(approved.status, "proof_approved");
    const proof = approved.proofs.find((p) => p.version === 1)!;
    assert.strictEqual(proof.approvedBy, ACTOR.email);
    assert.ok(proof.approvedAt);
    assert.match(proof.sha256Hash, /^[0-9a-f]{64}$/);
    assert.ok(approved.auditLog.some((e) => e.action === "PROOF_APPROVED"));
  });

  it("a change request keeps v1 with feedback and opens v2 for review", async () => {
    const draft = await newDraft();
    await toReview(draft.id);
    const revised = await requestDraftProofChanges(draft.id, "Make the logo bigger", ACTOR);
    assert.strictEqual(revised.status, "proof_pending");
    assert.strictEqual(revised.proofVersion, 2);
    assert.strictEqual(revised.proofs.length, 2);
    assert.strictEqual(revised.proofs[0].feedback, "Make the logo bigger");
    assert.strictEqual(revised.proofs[1].version, 2);
  });

  it("attaches a guest draft to a signed-in account", async () => {
    const customer = await createTestCustomer("attach");
    const draft = await newDraft();
    const attached = await attachDraftToUser(draft.id, customer.id, customer.email);
    assert.strictEqual(attached.customerId, customer.id);
    assert.strictEqual(attached.customerEmail, customer.email);
  });

  it("prices a draft from the catalogue, not from client input", async () => {
    const draft = await newDraft();
    const price = await calculateDraftPrice(draft);
    assert.ok(price.subtotalCents > 0);
    assert.strictEqual(price.subtotalCents, price.discountedUnitPriceCents * 150);
    assert.strictEqual(price.discountPercentage, 20, "150 units falls in the 100+ tier");
  });
});
