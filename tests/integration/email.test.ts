import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert";
import crypto from "crypto";
import { hasDatabase } from "./helpers";
import { sendNotificationEmail, safeSendNotificationEmail } from "@/modules/email/email-service";
import { getCapturedEmails, clearCapturedEmails, simulateProviderFailure } from "@/modules/email/email-provider";
import { getEmailLogs } from "@/modules/email/email-store";
import { db } from "@/lib/supabase/server";

const refs: string[] = [];
function ref(label: string): string {
  const value = `it-${label}-${crypto.randomBytes(4).toString("hex")}`;
  refs.push(value);
  return value;
}

describe("Transactional email (PRD § 13)", { skip: !hasDatabase }, () => {
  beforeEach(() => {
    clearCapturedEmails();
    simulateProviderFailure(false);
  });
  after(async () => {
    if (refs.length) await db().from("email_logs").delete().in("order_ref", refs);
  });

  it("renders order details and logs the send", async () => {
    const orderId = ref("confirm");
    const result = await sendNotificationEmail({
      to: "customer@e2e.w2p.test",
      recipientName: "Test Customer",
      event: "order_confirmed",
      orderId,
      orderNumber: "W2P-2026-000999",
      items: [{ name: "Pro Matte Vinyl Stickers", quantity: 250, amount: "₹850.00" }],
      totalFormatted: "₹1,003.00",
      shippingAddress: { name: "Test", line1: "1 Road", city: "New Delhi", postal_code: "110020", country: "India" },
    });
    assert.strictEqual(result.status, "sent");

    const captured = getCapturedEmails();
    assert.strictEqual(captured.length, 1);
    assert.ok(captured[0].subject.includes("W2P-2026-000999"));
    assert.ok(captured[0].text.includes("Pro Matte Vinyl Stickers"));
    assert.ok(captured[0].text.includes("110020"));

    const logs = await getEmailLogs({ orderId });
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].status, "sent");
    assert.ok(logs[0].provider_message_id);
  });

  it("sends exactly once when the same event is replayed", async () => {
    const orderId = ref("replay");
    const payload = { to: "replay@e2e.w2p.test", event: "order_confirmed" as const, orderId, orderNumber: orderId };
    assert.strictEqual((await sendNotificationEmail(payload)).status, "sent");
    assert.strictEqual((await sendNotificationEmail(payload)).status, "skipped_duplicate");
    assert.strictEqual(getCapturedEmails().length, 1);

    const statuses = (await getEmailLogs({ orderId })).map((l) => l.status).sort();
    assert.deepStrictEqual(statuses, ["sent", "skipped_duplicate"]);
  });

  it("the database refuses a second SENT row for the same key", async () => {
    const orderId = ref("unique");
    const row = {
      idempotency_key: `email:${orderId}:order_confirmed`,
      order_ref: orderId,
      event: "order_confirmed",
      recipient: "x@e2e.w2p.test",
      subject: "s",
      body_text: "t",
      body_html: "h",
      status: "sent",
      provider: "test",
    };
    assert.strictEqual((await db().from("email_logs").insert(row)).error, null);
    assert.ok((await db().from("email_logs").insert(row)).error, "duplicate sent row must violate the unique index");
  });

  it("a provider failure is logged and never thrown to the caller", async () => {
    const orderId = ref("outage");
    simulateProviderFailure(true, "HTTP 503 from provider");
    const result = await safeSendNotificationEmail({ to: "outage@e2e.w2p.test", event: "order_confirmed", orderId, orderNumber: orderId });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, "failed");

    const logs = await getEmailLogs({ orderId });
    assert.strictEqual(logs[0].status, "failed");
    assert.match(logs[0].error ?? "", /503/);
  });

  it("sends to the customer by default, and to the sandbox recipient only when sandbox mode is on", async () => {
    await sendNotificationEmail({ to: "customer-direct@e2e.w2p.test", event: "order_confirmed", orderId: ref("direct"), orderNumber: "direct" });
    assert.strictEqual(getCapturedEmails()[0].to, "customer-direct@e2e.w2p.test");
    clearCapturedEmails();

    const orderId = ref("sandbox");
    const previous = { from: process.env.EMAIL_FROM, sandbox: process.env.EMAIL_SANDBOX_RECIPIENT, mode: process.env.EMAIL_SANDBOX_MODE };
    process.env.EMAIL_SANDBOX_MODE = "true";
    process.env.EMAIL_FROM = "onboarding@resend.dev";
    process.env.EMAIL_SANDBOX_RECIPIENT = "owner@e2e.w2p.test";
    try {
      await sendNotificationEmail({ to: "real-customer@e2e.w2p.test", event: "order_confirmed", orderId, orderNumber: orderId });
      const [mail] = getCapturedEmails();
      assert.strictEqual(mail.to, "owner@e2e.w2p.test");
      assert.strictEqual(mail.originalTo, "real-customer@e2e.w2p.test");
      assert.match(mail.subject, /^\[Sandbox to: real-customer@e2e\.w2p\.test\]/);
    } finally {
      process.env.EMAIL_FROM = previous.from;
      process.env.EMAIL_SANDBOX_RECIPIENT = previous.sandbox;
      process.env.EMAIL_SANDBOX_MODE = previous.mode;
    }
  });
});
