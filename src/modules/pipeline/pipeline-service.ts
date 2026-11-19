import { PipelineStage, DivisionSlug } from "@/types/database";
import { PipelineStats, PipelineFilterOptions, OrderWithProofGate } from "./types";

export const PIPELINE_STAGES: PipelineStage[] = [
  "QUOTE",
  "ORDER",
  "ARTWORK",
  "PROOF",
  "PRODUCTION",
  "COMPLETED",
];

export function getNextPipelineStage(currentStage: PipelineStage): PipelineStage | null {
  const index = PIPELINE_STAGES.indexOf(currentStage);
  if (index >= 0 && index < PIPELINE_STAGES.length - 1) {
    return PIPELINE_STAGES[index + 1];
  }
  return null;
}

export function getPreviousPipelineStage(currentStage: PipelineStage): PipelineStage | null {
  const index = PIPELINE_STAGES.indexOf(currentStage);
  if (index > 0) {
    return PIPELINE_STAGES[index - 1];
  }
  return null;
}

/**
 * Computes business throughput and revenue analytics (§ 11 Capability 05)
 */
export function calculatePipelineStats(orders: OrderWithProofGate[]): PipelineStats {
  const throughputByDivision: Record<DivisionSlug, number> = {
    "labels-stickers": 0,
    "race-event-numbers": 0,
    "mtb-boards": 0,
    stamps: 0,
    trophies: 0,
    "laser-cut": 0,
  };

  const revenueByDivision: Record<DivisionSlug, number> = {
    "labels-stickers": 0,
    "race-event-numbers": 0,
    "mtb-boards": 0,
    stamps: 0,
    trophies: 0,
    "laser-cut": 0,
  };

  let totalRevenueCents = 0;
  let activeProductionCount = 0;
  let pendingProofCount = 0;
  let completedCount = 0;

  for (const order of orders) {
    totalRevenueCents += order.total_cents;

    if (order.pipeline_stage === "PRODUCTION") {
      activeProductionCount++;
    } else if (order.pipeline_stage === "PROOF") {
      pendingProofCount++;
    } else if (order.pipeline_stage === "COMPLETED") {
      completedCount++;
    }

    const divSlug = order.division_slug || "labels-stickers";
    if (throughputByDivision[divSlug] !== undefined) {
      throughputByDivision[divSlug]++;
      revenueByDivision[divSlug] += order.total_cents;
    }
  }

  return {
    totalRevenueCents,
    totalOrders: orders.length,
    activeProductionCount,
    pendingProofCount,
    completedCount,
    throughputByDivision,
    revenueByDivision,
  };
}

/**
 * Filter orders database by status, division, date range, and search query (§ 11 Capability 01)
 */
export function filterOrders(
  orders: OrderWithProofGate[],
  filters: PipelineFilterOptions
): OrderWithProofGate[] {
  const { searchQuery, stage, division, dateRange } = filters;
  const now = Date.now();

  return orders.filter((order) => {
    // Stage Filter
    if (stage !== "ALL" && order.pipeline_stage !== stage) {
      return false;
    }

    // Division Filter
    if (division !== "ALL" && order.division_slug !== division) {
      return false;
    }

    // Date Range Filter
    if (dateRange !== "all") {
      const orderTime = new Date(order.created_at).getTime();
      const diffMs = now - orderTime;
      const oneDayMs = 24 * 60 * 60 * 1000;

      if (dateRange === "today" && diffMs > oneDayMs) return false;
      if (dateRange === "7d" && diffMs > 7 * oneDayMs) return false;
      if (dateRange === "30d" && diffMs > 30 * oneDayMs) return false;
    }

    // Search Query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesNumber = order.order_number.toLowerCase().includes(query);
      const matchesName = (order.customer_name || "").toLowerCase().includes(query);
      const matchesEmail = (order.customer_email || "").toLowerCase().includes(query);
      const matchesCity = (order.shipping_address.city || "").toLowerCase().includes(query);

      return matchesNumber || matchesName || matchesEmail || matchesCity;
    }

    return true;
  });
}
