import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PIPELINE_STAGES,
  getNextPipelineStage,
  getPreviousPipelineStage,
  calculatePipelineStats,
  filterOrders,
} from "../pipeline-service";
import { OrderWithProofGate } from "../types";

describe("Production Pipeline & Staff Console Tests (§ 11)", () => {
  const sampleOrders: OrderWithProofGate[] = [
    {
      id: "ord-1",
      order_number: "DH-2026-00101",
      customer_id: "usr-1",
      customer_name: "Sarah Jenkins",
      customer_email: "sarah@enduro.co.uk",
      pipeline_stage: "QUOTE",
      payment_status: "paid",
      subtotal_cents: 10000,
      tax_cents: 2000,
      total_cents: 12000,
      currency: "GBP",
      shipping_address: { name: "Sarah", line1: "1 Trail Rd", city: "Ambleside", postal_code: "LA22", country: "GB" },
      division_slug: "mtb-boards",
      proof_status: "pending_review",
      is_unlocked: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "ord-2",
      order_number: "DH-2026-00102",
      customer_id: "usr-2",
      customer_name: "Liam O'Connor",
      customer_email: "liam@peak.co.uk",
      pipeline_stage: "PRODUCTION",
      payment_status: "paid",
      subtotal_cents: 30000,
      tax_cents: 6000,
      total_cents: 36000,
      currency: "GBP",
      shipping_address: { name: "Liam", line1: "2 Peak Way", city: "Bakewell", postal_code: "DE45", country: "GB" },
      division_slug: "race-event-numbers",
      proof_status: "approved",
      is_unlocked: true,
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "ord-3",
      order_number: "DH-2026-00103",
      customer_id: "usr-3",
      customer_name: "David Smith",
      customer_email: "david@kendal.org.uk",
      pipeline_stage: "COMPLETED",
      payment_status: "paid",
      subtotal_cents: 8000,
      tax_cents: 1600,
      total_cents: 9600,
      currency: "GBP",
      shipping_address: { name: "David", line1: "3 High St", city: "Kendal", postal_code: "LA9", country: "GB" },
      division_slug: "labels-stickers",
      proof_status: "approved",
      is_unlocked: true,
      created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  describe("Pipeline Stage Sequential Flow (§ 11 The Pipeline)", () => {
    it("strictly follows the 6-stage physical manufacturing order", () => {
      assert.deepEqual(PIPELINE_STAGES, [
        "QUOTE",
        "ORDER",
        "ARTWORK",
        "PROOF",
        "PRODUCTION",
        "COMPLETED",
      ]);
    });

    it("advances sequentially from QUOTE to ORDER to ARTWORK ... to COMPLETED", () => {
      assert.equal(getNextPipelineStage("QUOTE"), "ORDER");
      assert.equal(getNextPipelineStage("ORDER"), "ARTWORK");
      assert.equal(getNextPipelineStage("ARTWORK"), "PROOF");
      assert.equal(getNextPipelineStage("PROOF"), "PRODUCTION");
      assert.equal(getNextPipelineStage("PRODUCTION"), "COMPLETED");
      assert.equal(getNextPipelineStage("COMPLETED"), null);
    });

    it("retreats backward properly when corrections are needed", () => {
      assert.equal(getPreviousPipelineStage("COMPLETED"), "PRODUCTION");
      assert.equal(getPreviousPipelineStage("PRODUCTION"), "PROOF");
      assert.equal(getPreviousPipelineStage("QUOTE"), null);
    });
  });

  describe("Database Search & Filtering Engine (§ 11 Capability 01)", () => {
    it("filters orders strictly by pipeline stage", () => {
      const productionOnly = filterOrders(sampleOrders, {
        searchQuery: "",
        stage: "PRODUCTION",
        division: "ALL",
        dateRange: "all",
      });
      assert.equal(productionOnly.length, 1);
      assert.equal(productionOnly[0].order_number, "DH-2026-00102");
    });

    it("filters orders strictly by manufacturing division", () => {
      const mtbOnly = filterOrders(sampleOrders, {
        searchQuery: "",
        stage: "ALL",
        division: "mtb-boards",
        dateRange: "all",
      });
      assert.equal(mtbOnly.length, 1);
      assert.equal(mtbOnly[0].division_slug, "mtb-boards");
    });

    it("searches by customer name, email, or order number", () => {
      const searchByName = filterOrders(sampleOrders, {
        searchQuery: "Liam",
        stage: "ALL",
        division: "ALL",
        dateRange: "all",
      });
      assert.equal(searchByName.length, 1);
      assert.equal(searchByName[0].order_number, "DH-2026-00102");
    });
  });

  describe("Business Analytics & Throughput Aggregation (§ 11 Capability 05)", () => {
    it("aggregates total revenue and stage counts with precision", () => {
      const stats = calculatePipelineStats(sampleOrders);

      // Total revenue = 12000 + 36000 + 9600 = 57600 cents (£576.00)
      assert.equal(stats.totalRevenueCents, 57600);
      assert.equal(stats.totalOrders, 3);
      assert.equal(stats.activeProductionCount, 1);
      assert.equal(stats.completedCount, 1);

      // Division throughput
      assert.equal(stats.throughputByDivision["mtb-boards"], 1);
      assert.equal(stats.throughputByDivision["race-event-numbers"], 1);
      assert.equal(stats.throughputByDivision["labels-stickers"], 1);
      assert.equal(stats.revenueByDivision["race-event-numbers"], 36000);
    });
  });
});
