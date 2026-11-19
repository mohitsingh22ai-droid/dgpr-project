import { test, expect, APIRequestContext, Page } from "@playwright/test";
import Stripe from "stripe";
import { TEST_USERS, loginViaUi, apiToken } from "./support/auth-helpers";

/**
 * End-to-end money path (PRD §05, §07, §08, §11) against the real API:
 * approval gate → Stripe Checkout session → signed webhook (replay-safe) →
 * GST split → pipeline → revised proof → production-file gate and download.
 *
 * Stripe is called in test mode to create Checkout Sessions; payment completion
 * is delivered as a webhook signed with the e2e webhook secret.
 */

test.describe.configure({ mode: "serial" });
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "API flow runs once, on desktop"));

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_dummy");

const DELHI = { line1: "14 Okhla Industrial Estate", city: "New Delhi", stateCode: "07", postalCode: "110020" };
const MUMBAI = { line1: "7 Marol Naka", city: "Mumbai", stateCode: "27", postalCode: "400059" };

async function approvedDraft(page: Page): Promise<string> {
  const created = await page.request.post("/api/drafts", {
    data: { productId: "prod-vinyl-sticker", widthMm: 75, heightMm: 75, materialId: "gloss-white", quantity: 100 },
  });
  expect(created.status()).toBe(201);
  const draftId = (await created.json()).draft.id as string;
  const design = {
    version: "1.0", timestamp: new Date().toISOString(), productSlug: "custom-die-cut-vinyl",
    dimensionsMm: { widthMm: 75, heightMm: 75, bleedMm: 3, safetyMarginMm: 2.5 }, pxPerMm: 5, backgroundColor: "#FFFFFF",
    elements: [{ id: "t1", type: "text", x: 40, y: 40, text: "Café ₹ Zoë", fontSize: 30, fontFamily: "Inter", fill: "#111111", align: "left", rotation: 0, opacity: 1 }],
  };
  const patched = await page.request.patch(`/api/drafts/${draftId}`, {
    data: { updates: { designJson: design, status: "proof_pending" }, action: "PROOF_GENERATED" },
  });
  expect(patched.status()).toBe(200);
  expect((await page.request.post(`/api/drafts/${draftId}/approve-proof`, { data: {} })).status()).toBe(200);
  return draftId;
}

async function checkout(page: Page, draftId: string, address = DELHI) {
  return page.request.post("/api/checkout/session", {
    data: { draftId, customerName: "Sarah Jenkins", phone: "9810012345", shippingAddress: address },
  });
}

async function sendWebhook(request: APIRequestContext, session: Partial<Stripe.Checkout.Session>, type = "checkout.session.completed") {
  const payload = JSON.stringify({ id: `evt_${Date.now()}`, object: "event", type, data: { object: { object: "checkout.session", ...session } } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return request.post("/api/webhooks/stripe", { headers: { "stripe-signature": signature, "content-type": "application/json" }, data: payload });
}

async function adminOrder(request: APIRequestContext, adminHeaders: Record<string, string>, orderNumber: string) {
  return (await (await request.get(`/api/admin/orders/${orderNumber}`, { headers: adminHeaders })).json()).order;
}

test("approval gate: checkout is refused until the proof is approved", async ({ page }) => {
  await loginViaUi(page, TEST_USERS.customerA, "/dashboard");
  const created = await page.request.post("/api/drafts", {
    data: { productId: "prod-vinyl-sticker", widthMm: 75, heightMm: 75, materialId: "gloss-white", quantity: 100 },
  });
  const draftId = (await created.json()).draft.id;
  const res = await checkout(page, draftId);
  expect(res.status()).toBe(400);
  expect((await res.json()).code).toBe("PROOF_NOT_APPROVED");
});

test("address validation: invalid PIN code and mobile are rejected", async ({ page }) => {
  await loginViaUi(page, TEST_USERS.customerA, "/dashboard");
  const draftId = await approvedDraft(page);
  const res = await page.request.post("/api/checkout/session", {
    data: { draftId, customerName: "Sarah", phone: "12345", shippingAddress: { ...DELHI, postalCode: "SW1A 2AA" } },
  });
  expect(res.status()).toBe(400);
});

test("checkout → signed webhook → paid order; replays and forgeries change nothing; GST split by state", async ({ page, request }) => {
  await loginViaUi(page, TEST_USERS.customerA, "/dashboard");
  const adminHeaders = { Authorization: `Bearer ${await apiToken(request, TEST_USERS.admin)}` };

  // Delhi: intra-state CGST + SGST
  const draftId = await approvedDraft(page);
  const res = await checkout(page, draftId, DELHI);
  expect(res.status()).toBe(200);
  const { checkoutUrl, sessionId, orderNumber, pricing } = await res.json();
  expect(checkoutUrl).toContain("checkout.stripe.com");
  expect(pricing.cgstCents + pricing.sgstCents).toBe(pricing.taxCents);
  expect(pricing.igstCents).toBe(0);

  let order = await adminOrder(request, adminHeaders, orderNumber);
  expect(order.payment_status).toBe("pending");
  expect(order.pipeline_stage).toBe("QUOTE");
  expect(order.total_cents).toBe(pricing.totalCents);

  // Forged / unsigned events are rejected and do not pay the order
  const unsigned = await request.post("/api/webhooks/stripe", { data: { type: "checkout.session.completed" } });
  expect(unsigned.status()).toBe(400);
  const wrongAmount = await sendWebhook(request, { id: sessionId, payment_status: "paid", amount_total: 1, metadata: { orderId: order.id } });
  expect(wrongAmount.status()).toBe(500);
  expect((await adminOrder(request, adminHeaders, orderNumber)).payment_status).toBe("pending");

  // Genuine payment
  const paid = await sendWebhook(request, { id: sessionId, payment_status: "paid", amount_total: pricing.totalCents, metadata: { orderId: order.id } });
  expect(paid.status()).toBe(200);
  expect((await paid.json()).duplicate).toBe(false);
  order = await adminOrder(request, adminHeaders, orderNumber);
  expect(order.payment_status).toBe("paid");
  expect(order.pipeline_stage).toBe("ORDER");
  expect(order.isReadyForProduction).toBe(true);

  // Replay: idempotent
  const replay = await sendWebhook(request, { id: sessionId, payment_status: "paid", amount_total: pricing.totalCents, metadata: { orderId: order.id } });
  expect((await replay.json()).duplicate).toBe(true);
  const draft = (await (await page.request.get(`/api/drafts/${draftId}`)).json()).draft;
  expect(draft.status).toBe("paid");

  // Customer sees exactly this order once
  const mine = (await (await page.request.get("/api/orders")).json()).orders;
  expect(mine.filter((o: { order_number: string }) => o.order_number === orderNumber)).toHaveLength(1);

  // Maharashtra: inter-state IGST
  const draft2 = await approvedDraft(page);
  const res2 = await checkout(page, draft2, MUMBAI);
  const p2 = (await res2.json()).pricing;
  expect(p2.isInterState).toBe(true);
  expect(p2.igstCents).toBe(p2.taxCents);
  expect(p2.cgstCents + p2.sgstCents).toBe(0);
});

test("revised proof after payment re-locks production until the customer approves; files then download", async ({ page, request }) => {
  test.setTimeout(240_000);
  await loginViaUi(page, TEST_USERS.customerA, "/dashboard");
  const adminHeaders = { Authorization: `Bearer ${await apiToken(request, TEST_USERS.admin)}` };

  const draftId = await approvedDraft(page);
  const { sessionId, orderNumber, pricing } = await (await checkout(page, draftId)).json();
  const order = await adminOrder(request, adminHeaders, orderNumber);
  await sendWebhook(request, { id: sessionId, payment_status: "paid", amount_total: pricing.totalCents, metadata: { orderId: order.id } });

  // Pre-press: ORDER → ARTWORK, then issue revised proof v2 (ARTWORK → PROOF)
  const toArtwork = await request.patch(`/api/admin/orders/${orderNumber}/stage`, { headers: adminHeaders, data: { stage: "ARTWORK", expectedStage: "ORDER" } });
  expect(toArtwork.status()).toBe(200);
  const revised = await request.post(`/api/admin/orders/${orderNumber}/proofs`, { headers: adminHeaders });
  expect(revised.status()).toBe(201);
  expect((await revised.json()).version).toBe(2);

  // Production is locked while v2 awaits approval, and skipping to PRODUCTION is refused
  expect((await request.get(`/api/admin/orders/${orderNumber}/download-production`, { headers: adminHeaders })).status()).toBe(403);
  const skip = await request.patch(`/api/admin/orders/${orderNumber}/stage`, { headers: adminHeaders, data: { stage: "PRODUCTION", expectedStage: "PROOF" } });
  expect(skip.status()).toBe(400);

  // Customer approves v2 → PRODUCTION
  const proofs = (await (await page.request.get("/api/proofs")).json()).proofs as Array<{ id: string; order_id: string; version_number: number; status: string }>;
  const v2 = proofs.find((p) => p.order_id === orderNumber && p.version_number === 2)!;
  expect(v2.status).toBe("pending_review");
  const approve = await page.request.post(`/api/proofs/${v2.id}/approve`, { data: { orderId: orderNumber, version: 2 } });
  expect(approve.status()).toBe(200);
  expect((await adminOrder(request, adminHeaders, orderNumber)).pipeline_stage).toBe("PRODUCTION");

  // Production files: generated server-side, named by convention, short-lived links
  const dl = await request.get(`/api/admin/orders/${orderNumber}/download-production`, { headers: adminHeaders });
  expect(dl.status(), await dl.text()).toBe(200);
  const { files, ttlSeconds } = await dl.json();
  expect(ttlSeconds).toBe(60);
  const pdf = files.find((f: { kind: string }) => f.kind === "pdf");
  expect(pdf.fileName).toMatch(new RegExp(`^${orderNumber}_labels-stickers_\\d{8}_Output\\.pdf$`));
  expect(files.some((f: { kind: string }) => f.kind === "png")).toBe(true);
  // Fetch from storage with Node fetch (honours the environment proxy).
  const bytes = Buffer.from(await (await fetch(pdf.url)).arrayBuffer());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

  // Customers can never reach admin downloads
  const custHeaders = { Authorization: `Bearer ${await apiToken(request, TEST_USERS.customerA)}` };
  expect((await request.get(`/api/admin/orders/${orderNumber}/download-production`, { headers: custHeaders })).status()).toBe(403);
});
