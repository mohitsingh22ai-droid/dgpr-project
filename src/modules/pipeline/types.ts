import { PipelineStage, DivisionSlug, Order, ProofStatus } from "@/types/database";

export interface PipelineStats {
  totalRevenueCents: number;
  totalOrders: number;
  activeProductionCount: number;
  pendingProofCount: number;
  completedCount: number;
  throughputByDivision: Record<DivisionSlug, number>;
  revenueByDivision: Record<DivisionSlug, number>;
}

export interface PipelineFilterOptions {
  searchQuery: string;
  stage: PipelineStage | "ALL";
  division: DivisionSlug | "ALL";
  dateRange: "all" | "today" | "7d" | "30d";
}

export interface OrderWithProofGate extends Order {
  division_slug: DivisionSlug;
  proof_status: ProofStatus;
  operator_notes?: string;
  is_unlocked: boolean;
}
