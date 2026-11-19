import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkApprovalGate,
  processProofApproval,
  processProofRevisionRequest,
  generateWatermarkedProofSvg,
} from "../proof-generator";
import { ProofRecord, ProofMetadata } from "../types";

describe("Proof & Version Control with Approval Gate (§ 08 & Testing Checklist)", () => {
  const sampleMetadata: ProofMetadata = {
    version: 1,
    widthMm: 175,
    heightMm: 155,
    materialName: "0.8mm Flexible Polypropylene",
    bleedMm: 4.0,
    orderNumber: "DH-2026-00101",
    createdAt: new Date().toISOString(),
  };

  const sampleProof: ProofRecord = {
    id: "prf-101-v1",
    orderId: "DH-2026-00101",
    orderItemId: "item-101",
    version: 1,
    status: "pending_review",
    previewUrl: "https://example.com/preview.png",
    metadata: sampleMetadata,
    customerFeedback: null,
    approvedBy: null,
    approvedAt: null,
    createdAt: new Date().toISOString(),
  };

  describe("Approval Gate Security (§ 08 & § 11 Capability 02)", () => {
    it("strictly locks production files when proof status is pending_review", () => {
      const gate = checkApprovalGate("pending_review");
      assert.equal(gate.isUnlocked, false);
      assert.ok(gate.reason?.includes("Locked"));
    });

    it("strictly locks production files when customer requested changes", () => {
      const gate = checkApprovalGate("changes_requested");
      assert.equal(gate.isUnlocked, false);
      assert.ok(gate.reason?.includes("Locked"));
    });

    it("unlocks 300 DPI production files ONLY when proof status is approved", () => {
      const gate = checkApprovalGate("approved");
      assert.equal(gate.isUnlocked, true);
      assert.equal(gate.status, "approved");
      assert.equal(gate.reason, undefined);
    });
  });

  describe("Proof Revision State Transitions (§ 08)", () => {
    it("records approved_by, timestamp, and transitions state to APPROVED", () => {
      const approvedByEmail = "sarah.j@enduroclub.uk";
      const approvedProof = processProofApproval(sampleProof, approvedByEmail);

      assert.equal(approvedProof.status, "approved");
      assert.equal(approvedProof.approvedBy, approvedByEmail);
      assert.ok(approvedProof.approvedAt);

      // Gate check must now pass
      const gate = checkApprovalGate(approvedProof.status);
      assert.equal(gate.isUnlocked, true);
    });

    it("captures revision comments and spawns version v+1 when changes requested", () => {
      const feedback = "Please shift the title 2mm left and darken the sponsor badge";
      const { updatedCurrent, nextRevision } = processProofRevisionRequest(sampleProof, feedback);

      // Current revision should be marked changes_requested with feedback
      assert.equal(updatedCurrent.status, "changes_requested");
      assert.equal(updatedCurrent.customerFeedback, feedback);
      assert.equal(updatedCurrent.version, 1);

      // Next revision should be spawned as v2 in pending_review state
      assert.equal(nextRevision.version, 2);
      assert.equal(nextRevision.status, "pending_review");
      assert.equal(nextRevision.orderId, sampleProof.orderId);
      assert.equal(nextRevision.metadata.version, 2);

      // Gate check on next revision must still be locked until signed off
      const nextGate = checkApprovalGate(nextRevision.status);
      assert.equal(nextGate.isUnlocked, false);
    });
  });

  describe("Watermarked Visual Proof Generator (§ 08)", () => {
    it("generates watermarked SVG containing security text and technical metadata", () => {
      const svg = generateWatermarkedProofSvg(sampleMetadata);

      assert.ok(svg.includes("PROOF v1"));
      assert.ok(svg.includes("Trim 175×155 mm"));
      assert.ok(svg.includes("bleed 4 mm"));
    });
  });
});
