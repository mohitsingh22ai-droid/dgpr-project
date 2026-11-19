import { test, expect, APIRequestContext } from "@playwright/test";
import { TEST_USERS } from "./support/auth-helpers";

/**
 * Security regression suite for the critical defects found in the Phase 0 audit
 * (A1–A10). Every test asserts the CORRECT behaviour, so each one fails until the
 * phase that owns it fixes the defect:
 *   A1, A2        → Phase 1 (auth foundation)
 *   A3, A7–A10    → Phase 2 (authorisation & isolation)
 *   A4            → Phase 4 (draft state machine)
 *   A5, A6        → Phase 6 (checkout & payments)
 *
 * These are API-level checks, so they only run in the desktop project.
 */

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "API-level checks run once, on desktop");
});

async function loginToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post("/api/auth/login", { data: { email, password } });
  expect(res.status(), `login for ${email} should succeed`).toBe(200);
  const body = await res.json();
  return body.token as string;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createGuestDraft(request: APIRequestContext, quantity = 100): Promise<string> {
  const res = await request.post("/api/drafts", {
    data: {
      productId: "prod-vinyl-sticker",
      widthMm: 75,
      heightMm: 75,
      materialId: "gloss-white",
      quantity,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).draft.id as string;
}

const VALID_ADDRESS = {
  line1: "1 Test Street",
  city: "Testville",
  postal_code: "SW1A 2AA",
  country: "United Kingdom",
};

test.describe("A1/A2 · Authentication", () => {
  test("A1: a shared 'master' password must not log in to another user's account", async ({ request }) => {
    for (const [email, password] of [
      [TEST_USERS.customerA.email, "password"],
      [TEST_USERS.admin.email, "customer123"],
      [TEST_USERS.customerA.email, "admin123"],
    ]) {
      const res = await request.post("/api/auth/login", { data: { email, password } });
      expect(res.status(), `${email} / ${password} must be rejected`).toBe(401);
    }
  });

  test("A2: registration must not store the password in plain text", async ({ request }) => {
    const email = `plain-${Date.now()}@e2e.w2p.test`;
    const password = "Sup3r-Secret-Pass!";
    const res = await request.post("/api/auth/register", { data: { email, password, fullName: "Plain Text" } });
    expect(res.status()).toBe(201);

    // Credentials live only in Supabase Auth: the app's profile row must hold no password data.
    const { db } = await import("../src/lib/supabase/server");
    const { data } = await db().from("profiles").select("*").eq("email", email).single();
    expect(data, "registered user should have a profile").toBeTruthy();
    expect(Object.keys(data!).filter((c) => /pass/i.test(c))).toEqual([]);
    expect(JSON.stringify(data)).not.toContain(password);
  });
});

test.describe("A3 · Order creation", () => {
  test("A3: an anonymous caller must not be able to create a paid order", async ({ request }) => {
    const res = await request.post("/api/orders", {
      data: {
        id: `ord-forged-${Date.now()}`,
        order_number: `FORGED-${Date.now()}`,
        customer_id: "usr-cust-1",
        customer_email: TEST_USERS.customerA.email,
        pipeline_stage: "PRODUCTION",
        payment_status: "paid",
        total_cents: 1,
        subtotal_cents: 1,
        tax_cents: 0,
        currency: "GBP",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    expect([401, 403, 404, 405]).toContain(res.status());
  });

  test("A3: a signed-in customer must not be able to create a paid order directly", async ({ request }) => {
    const token = await loginToken(request, TEST_USERS.customerA.email, TEST_USERS.customerA.password);
    const res = await request.post("/api/orders", {
      headers: bearer(token),
      data: {
        id: `ord-self-paid-${Date.now()}`,
        order_number: `SELFPAID-${Date.now()}`,
        pipeline_stage: "PRODUCTION",
        payment_status: "paid",
        total_cents: 1,
        subtotal_cents: 1,
        tax_cents: 0,
        currency: "GBP",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    expect([403, 404, 405]).toContain(res.status());
  });
});

test.describe("A4 · Draft state machine", () => {
  test("A4: PATCH must not move a draft straight to proof_approved or change protected fields", async ({ request }) => {
    const draftId = await createGuestDraft(request);
    const res = await request.patch(`/api/drafts/${draftId}`, {
      data: { updates: { status: "proof_approved", quantity: 1_000_000, customerId: "usr-cust-2" } },
    });

    const after = await (await request.get(`/api/drafts/${draftId}`)).json();
    expect(res.status(), "illegal update must be rejected").toBeGreaterThanOrEqual(400);
    expect(after.draft.status).toBe("configured");
    expect(after.draft.quantity).toBe(100);
    expect(after.draft.customerId).toBeNull();
  });
});

test.describe("A5/A6 · Payments", () => {
  test("A5: the server must not accept raw card numbers or mark an order paid without the payment provider", async ({ request }) => {
    const token = await loginToken(request, TEST_USERS.customerA.email, TEST_USERS.customerA.password);
    const draftId = await createGuestDraft(request);
    // Use whatever path currently exists to approve the proof; the point of this test is the payment step.
    await request.post(`/api/drafts/${draftId}/approve-proof`, { headers: bearer(token), data: {} });

    const res = await request.post("/api/checkout/session", {
      headers: bearer(token),
      data: {
        draftId,
        customerEmail: TEST_USERS.customerA.email,
        customerName: "Sarah Jenkins",
        paymentMethod: "card",
        cardNumber: "1111 1111 1111 1111",
        shippingAddress: VALID_ADDRESS,
      },
    });
    const body = await res.json().catch(() => ({}));
    expect(body.order?.payment_status, "no order may be marked paid by our own server").not.toBe("paid");
    expect(body.isSimulated, "payment must not be simulated").not.toBe(true);
  });

  test("A6: an unsigned Stripe webhook must be rejected", async ({ request }) => {
    const res = await request.post("/api/webhooks/stripe", {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        type: "checkout.session.completed",
        data: { object: { id: `cs_forged_${Date.now()}`, metadata: { totalCents: "1" } } },
      }),
    });
    expect(res.status()).toBe(400);
    const body = await res.json().catch(() => ({}));
    expect(body.isNew).not.toBe(true);
  });
});

test.describe("A7–A10 · Authorisation & isolation", () => {
  test("A7: a customer only ever sees orders that belong to them", async ({ request }) => {
    // Attempt an order from another party through the public flow (may legitimately be refused once fixed).
    const draftId = await createGuestDraft(request);
    await request.post(`/api/drafts/${draftId}/approve-proof`, { data: {} });
    await request.post("/api/checkout/session", {
      data: {
        draftId,
        customerEmail: "stranger@example.com",
        customerName: "A Stranger",
        paymentMethod: "card",
        cardNumber: "4242 4242 4242 4242",
        shippingAddress: VALID_ADDRESS,
      },
    });

    const token = await loginToken(request, TEST_USERS.customerA.email, TEST_USERS.customerA.password);
    const res = await request.get("/api/orders", { headers: bearer(token) });
    expect(res.status()).toBe(200);
    const { orders } = await res.json();
    for (const order of orders) {
      expect(order.customer_email, `order ${order.order_number} leaked to Customer A`).toBe(TEST_USERS.customerA.email);
    }
  });

  test("A8: proofs cannot be approved without a session", async ({ request }) => {
    const res = await request.post("/api/proofs/prf-101/approve", {
      data: { orderId: "W2P-2026-00101", version: 1 },
    });
    expect(res.status()).toBe(401);
  });

  test("A8: another customer cannot approve, change or take over a customer's draft", async ({ request }) => {
    const ownerToken = await loginToken(request, TEST_USERS.customerA.email, TEST_USERS.customerA.password);
    const createRes = await request.post("/api/drafts", {
      headers: bearer(ownerToken),
      data: { productId: "prod-vinyl-sticker", widthMm: 75, heightMm: 75, materialId: "gloss-white", quantity: 100 },
    });
    const draftId = (await createRes.json()).draft.id as string;

    const otherToken = await loginToken(request, TEST_USERS.customerB.email, TEST_USERS.customerB.password);
    const approve = await request.post(`/api/drafts/${draftId}/approve-proof`, { headers: bearer(otherToken), data: {} });
    const changes = await request.post(`/api/drafts/${draftId}/request-changes`, {
      headers: bearer(otherToken),
      data: { feedback: "hijack" },
    });
    const attach = await request.post(`/api/drafts/${draftId}/attach-user`, {
      headers: bearer(otherToken),
      data: { userId: "usr-cust-2", userEmail: TEST_USERS.customerB.email },
    });
    const anonymousAttach = await request.post(`/api/drafts/${draftId}/attach-user`, {
      data: { userId: "usr-cust-2", userEmail: TEST_USERS.customerB.email },
    });

    expect(approve.status(), "approve by non-owner").toBe(403);
    expect(changes.status(), "request-changes by non-owner").toBe(403);
    expect(attach.status(), "attach by non-owner").toBe(403);
    expect([401, 403]).toContain(anonymousAttach.status());
  });

  test("A9: a customer session must not be served the admin production console", async ({ request }) => {
    // Signing in through the API stores the session cookies in this request context.
    await loginToken(request, TEST_USERS.customerA.email, TEST_USERS.customerA.password);
    const res = await request.get("/production", { maxRedirects: 0 });
    expect([302, 303, 307, 308, 403, 404]).toContain(res.status());
  });

  test("A10: print-engine and CSV-merge endpoints require an authenticated session", async ({ request }) => {
    const render = await request.post("/api/print-engine/render", { data: { widthMm: 50, heightMm: 50 } });
    const merge = await request.post("/api/variable-data/merge", {
      data: { csvContent: "BibNumber,AthleteName\n1,Test", fieldMappings: { numberCol: "BibNumber", nameCol: "AthleteName" } },
    });
    expect(render.status()).toBe(401);
    expect(merge.status()).toBe(401);
  });

  test("A10: non-Latin text must not crash the print engine", async ({ request }) => {
    const token = await loginToken(request, TEST_USERS.admin.email, TEST_USERS.admin.password);
    const res = await request.post("/api/print-engine/render", {
      headers: bearer(token),
      data: { widthMm: 50, heightMm: 50, customText: "₹ 499 · Café · Zoë" },
    });
    expect(res.status()).not.toBe(500);
  });
});
