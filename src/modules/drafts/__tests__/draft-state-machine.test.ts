import { describe, test } from "node:test";
import assert from "node:assert";
import { canTransition } from "@/modules/drafts/draft-store";

describe("Job draft state machine (§ 01, § 05, § 08)", () => {
  test("follows configured → artwork_ready → proof_pending → proof_approved → payment_pending → paid", () => {
    assert.equal(canTransition("configured", "artwork_ready"), true);
    assert.equal(canTransition("artwork_ready", "proof_pending"), true);
    assert.equal(canTransition("proof_pending", "proof_approved"), true);
    assert.equal(canTransition("proof_approved", "payment_pending"), true);
    assert.equal(canTransition("payment_pending", "paid"), true);
  });

  test("never allows payment before proof approval", () => {
    assert.equal(canTransition("configured", "payment_pending"), false);
    assert.equal(canTransition("configured", "proof_approved"), false);
    assert.equal(canTransition("artwork_ready", "payment_pending"), false);
    assert.equal(canTransition("proof_pending", "payment_pending"), false);
    assert.equal(canTransition("proof_pending", "paid"), false);
  });

  test("allows revision and payment-retry loops", () => {
    assert.equal(canTransition("proof_pending", "proof_pending"), true);
    assert.equal(canTransition("proof_approved", "proof_pending"), true);
    assert.equal(canTransition("payment_pending", "proof_approved"), true);
  });

  test("treats paid as terminal", () => {
    for (const to of ["configured", "artwork_ready", "proof_pending", "proof_approved", "payment_pending"] as const) {
      assert.equal(canTransition("paid", to), false);
    }
  });
});
