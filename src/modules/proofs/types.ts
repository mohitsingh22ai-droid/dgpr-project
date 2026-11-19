import { ProofStatus } from "@/types/database";

export interface ProofMetadata {
  version: number;
  widthMm?: number;
  heightMm?: number;
  materialName?: string;
  bleedMm?: number;
  orderNumber?: string;
  orderId?: string;
  productName?: string;
  createdAt: string;
}

export interface ProofRecord {
  id: string;
  orderId: string;
  orderItemId: string;
  version: number; // 1, 2, 3...
  status: ProofStatus; // 'pending_review' | 'approved' | 'changes_requested'
  previewUrl: string;
  metadata: ProofMetadata;
  customerFeedback?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
}

export interface ApprovalGateCheckResult {
  isUnlocked: boolean;
  status: ProofStatus;
  reason?: string;
}
