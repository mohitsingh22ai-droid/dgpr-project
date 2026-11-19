import { describe, it } from "node:test";
import assert from "node:assert";
import {
  checkReadyForProduction,
  validateStageTransition,
  generateSignedDownloadToken,
  verifySignedDownloadToken,
} from "@/modules/orders/order-store";
import { validatePricingTiers } from "@/modules/catalog/catalog-store";
import { Order } from "@/types/database";

// Signing needs a secret; unit tests never touch the database.
process.env.SIGNED_URL_SECRET = process.env.SIGNED_URL_SECRET || "unit-test-secret";

function order(partial: Partial<Order>): Order {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    order_number: "W2P-2026-000001",
    customer_id: "00000000-0000-0000-0000-000000000002",
    pipeline_stage: "ORDER",
    payment_status: "pending",
    subtotal_cents: 1000,
    tax_cents: 180,
    total_cents: 1180,
    currency: "INR",
    shipping_address: { name: "A", line1: "1 Road", city: "New Delhi", postal_code: "110001", country: "India" },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("Pipeline rules (PRD § 11)", () => {
  it("allows exactly one forward step at a time", () => {
    assert.strictEqual(validateStageTransition("QUOTE", "ORDER").valid, true);
    assert.strictEqual(validateStageTransition("ORDER", "ARTWORK").valid, true);
    assert.strictEqual(validateStageTransition("ARTWORK", "PROOF").valid, true);
    assert.strictEqual(validateStageTransition("PROOF", "PRODUCTION").valid, true);
    assert.strictEqual(validateStageTransition("PRODUCTION", "COMPLETED").valid, true);
  });

  it("rejects skipping stages", () => {
    const skip = validateStageTransition("QUOTE", "PRODUCTION");
    assert.strictEqual(skip.valid, false);
    assert.match(skip.error ?? "", /Stage skipping is not allowed/);
    assert.strictEqual(validateStageTransition("ORDER", "COMPLETED").valid, false);
  });

  it("allows only the pre-press backward steps", () => {
    assert.strictEqual(validateStageTransition("PROOF", "ARTWORK").valid, true);
    assert.strictEqual(validateStageTransition("ARTWORK", "ORDER").valid, true);
    const back = validateStageTransition("COMPLETED", "QUOTE");
    assert.strictEqual(back.valid, false);
    assert.match(back.error ?? "", /Illegal backward transition/);
  });

  it("is ready for production only when paid AND proof approved", () => {
    assert.strictEqual(checkReadyForProduction(order({ payment_status: "paid", approved_proof_version: 1 })).isReady, true);

    const unpaid = checkReadyForProduction(order({ payment_status: "pending", approved_proof_version: 1 }));
    assert.strictEqual(unpaid.isReady, false);
    assert.match(unpaid.reason ?? "", /Payment not confirmed/);

    const neither = checkReadyForProduction(order({ payment_status: "pending" }));
    assert.strictEqual(neither.isReady, false);
    assert.match(neither.reason ?? "", /Proof not approved and payment not confirmed/);
  });
});

describe("Signed production download tokens", () => {
  it("verifies a fresh token only for its own order and rejects tampering", () => {
    const { token, expires } = generateSignedDownloadToken("W2P-2026-000101", 60);
    assert.ok(expires > Math.floor(Date.now() / 1000));
    assert.strictEqual(verifySignedDownloadToken("W2P-2026-000101", token), true);
    assert.strictEqual(verifySignedDownloadToken("W2P-2026-999999", token), false);
    assert.strictEqual(verifySignedDownloadToken("W2P-2026-000101", token + "bad"), false);
    assert.strictEqual(verifySignedDownloadToken("W2P-2026-000101", ""), false);
  });

  it("rejects an expired token", () => {
    const { token } = generateSignedDownloadToken("W2P-2026-000101", -5);
    assert.strictEqual(verifySignedDownloadToken("W2P-2026-000101", token), false);
  });
});

describe("Volume discount tier validation", () => {
  it("accepts well-formed tiers", () => {
    assert.deepStrictEqual(
      validatePricingTiers([
        { min_quantity: 1, discount_percentage: 0 },
        { min_quantity: 100, discount_percentage: 20 },
      ]),
      { valid: true }
    );
  });

  it("rejects duplicate floors, negative or >100% discounts and non-positive floors", () => {
    assert.match(
      validatePricingTiers([
        { min_quantity: 50, discount_percentage: 10 },
        { min_quantity: 50, discount_percentage: 20 },
      ]).error ?? "",
      /Duplicate tier floor/
    );
    assert.match(validatePricingTiers([{ min_quantity: 50, discount_percentage: -5 }]).error ?? "", /between 0 and 100/);
    assert.match(validatePricingTiers([{ min_quantity: 50, discount_percentage: 120 }]).error ?? "", /between 0 and 100/);
    assert.match(validatePricingTiers([{ min_quantity: 0, discount_percentage: 5 }]).error ?? "", /positive integer/);
  });
});
