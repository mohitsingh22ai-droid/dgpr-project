import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { hasDatabase, createTestCustomer, cleanupAccounts, SHIPPING, TestAccount } from "./helpers";
import {
  createOrder,
  getOrderById,
  getOrdersForUser,
  searchAdminOrders,
  updateOrderStageWithVersion,
  getAdminReportsData,
  getArchivedOrders,
  reserveOrderNumber,
} from "@/modules/orders/order-store";
import { getProofsForUser } from "@/modules/proofs/proofs-store";
import { createDraft, approveDraftProof, transitionDraftStatus } from "@/modules/drafts/draft-store";
import { saveDesign, getSavedDesignsForUser, deleteSavedDesign } from "@/modules/designs/saved-designs-store";
import { Order } from "@/types/database";

function orderFor(account: TestAccount, overrides: Partial<Order> = {}): Order {
  return {
    id: "",
    order_number: "",
    customer_id: account.id,
    customer_email: account.email,
    customer_name: "Test Customer",
    pipeline_stage: "ORDER",
    payment_status: "paid",
    subtotal_cents: 10000,
    tax_cents: 1800,
    total_cents: 11800,
    currency: "INR",
    division_slug: "labels-stickers",
    shipping_address: SHIPPING,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("Orders, isolation, admin search & reports (PRD § 05, § 10, § 11)", { skip: !hasDatabase }, () => {
  let alice: TestAccount;
  let bob: TestAccount;

  before(async () => {
    alice = await createTestCustomer("alice");
    bob = await createTestCustomer("bob");
  });
  after(cleanupAccounts);

  it("reserves unique, sequential order numbers", async () => {
    const a = await reserveOrderNumber();
    const b = await reserveOrderNumber();
    assert.match(a, /^W2P-\d{4}-\d{6}$/);
    assert.notStrictEqual(a, b);
  });

  it("refuses an order without a real customer account", async () => {
    await assert.rejects(createOrder({ ...orderFor(alice), customer_id: "usr-cust-01" }), /signed-in customer/);
  });

  it("stores GST-consistent totals and an order event", async () => {
    const { order, isNew } = await createOrder(orderFor(alice));
    assert.strictEqual(isNew, true);
    assert.strictEqual(order.total_cents, order.subtotal_cents + order.tax_cents);
    assert.strictEqual(order.status_history?.length, 1);
  });

  it("is idempotent on order number and Stripe session id", async () => {
    const orderNumber = await reserveOrderNumber();
    const first = await createOrder(orderFor(alice, { order_number: orderNumber, stripe_session_id: `cs_test_${orderNumber}` }));
    const replay = await createOrder(orderFor(alice, { order_number: orderNumber }));
    const replayBySession = await createOrder(orderFor(alice, { stripe_session_id: `cs_test_${orderNumber}` }));
    assert.strictEqual(replay.isNew, false);
    assert.strictEqual(replayBySession.isNew, false);
    assert.strictEqual(replay.order.id, first.order.id);
    assert.strictEqual(replayBySession.order.id, first.order.id);
  });

  it("customers only ever see their own orders, proofs and designs", async () => {
    await createOrder(orderFor(bob));
    const aliceDraft = await createDraft({ productId: "prod-vinyl-sticker", widthMm: 60, heightMm: 60, materialId: "gloss-white", quantity: 10, customerId: alice.id });
    await transitionDraftStatus(aliceDraft.id, "artwork_ready", alice);
    await transitionDraftStatus(aliceDraft.id, "proof_pending", alice);
    await approveDraftProof(aliceDraft.id, alice);
    await saveDesign({ customer_id: alice.id, product_id: "prod-vinyl-sticker", name: "Alice art", width_mm: 60, height_mm: 60, material: "gloss-white", canvas_state: {} });

    const aliceOrders = await getOrdersForUser(alice.id);
    const bobOrders = await getOrdersForUser(bob.id);
    assert.ok(aliceOrders.length > 0 && bobOrders.length > 0);
    assert.ok(aliceOrders.every((o) => o.customer_id === alice.id));
    assert.ok(bobOrders.every((o) => o.customer_id === bob.id));

    assert.strictEqual((await getProofsForUser(alice.id)).length, 1);
    assert.strictEqual((await getProofsForUser(bob.id)).length, 0);

    const aliceDesigns = await getSavedDesignsForUser(alice.id);
    assert.strictEqual(aliceDesigns.length, 1);
    assert.strictEqual((await getSavedDesignsForUser(bob.id)).length, 0);
    assert.strictEqual(await deleteSavedDesign(aliceDesigns[0].id, bob.id), false, "another customer cannot delete it");

    assert.deepStrictEqual(await getOrdersForUser("not-a-uuid"), []);
  });

  it("admin search filters combine and paginate server-side", async () => {
    await createOrder(orderFor(alice, { payment_status: "pending", division_slug: "trophies" }));
    const byEmail = await searchAdminOrders({ query: alice.email });
    assert.ok(byEmail.total >= 3);
    assert.ok(byEmail.orders.every((o) => o.customer_email === alice.email));

    const combined = await searchAdminOrders({ query: alice.email, payment_status: "pending", product_type: "trophies" });
    assert.strictEqual(combined.total, 1);

    const paged = await searchAdminOrders({ query: alice.email, limit: 1, page: 2 });
    assert.strictEqual(paged.orders.length, 1);
    assert.strictEqual(paged.totalPages, byEmail.total);

    const today = new Date().toISOString().slice(0, 10);
    const todayOnly = await searchAdminOrders({ query: alice.email, date_from: today, date_to: today });
    assert.strictEqual(todayOnly.total, byEmail.total, "date_to includes the whole end day");
  });

  it("moves stages one step at a time with optimistic locking and history", async () => {
    const { order } = await createOrder(orderFor(alice));
    const stale = await updateOrderStageWithVersion(order.order_number, "ARTWORK", "PROOF", "admin@e2e.w2p.test");
    assert.strictEqual(stale.conflict, true);

    const skip = await updateOrderStageWithVersion(order.order_number, "PRODUCTION", "ORDER", "admin@e2e.w2p.test");
    assert.strictEqual(skip.success, false);

    const ok = await updateOrderStageWithVersion(order.order_number, "ARTWORK", "ORDER", "admin@e2e.w2p.test", "files checked");
    assert.strictEqual(ok.success, true);
    assert.strictEqual(ok.fromStage, "ORDER");
    const reloaded = await getOrderById(order.order_number);
    assert.strictEqual(reloaded?.pipeline_stage, "ARTWORK");
    assert.strictEqual(reloaded?.status_history?.at(-1)?.notes, "files checked");
  });

  it("reports count revenue from paid orders only, and the archive holds completed orders", async () => {
    const before = await getAdminReportsData();
    await createOrder(orderFor(alice, { payment_status: "pending", subtotal_cents: 50000, tax_cents: 9000, total_cents: 59000 }));
    const { order: paid } = await createOrder(orderFor(alice, { subtotal_cents: 1000, tax_cents: 180, total_cents: 1180, approved_proof_version: 1 }));
    const after = await getAdminReportsData();
    assert.strictEqual(after.confirmedRevenueCents - before.confirmedRevenueCents, 1180);
    assert.strictEqual(after.currency, "INR");

    for (const stage of ["ARTWORK", "PRODUCTION", "COMPLETED"] as const) {
      await updateOrderStageWithVersion(paid.order_number, stage, undefined, "admin@e2e.w2p.test");
    }
    const archive = await getArchivedOrders({ query: paid.order_number });
    assert.strictEqual(archive.total, 1);
  });
});
