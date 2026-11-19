import { DivisionSlug } from "./database";

export type DraftStatus =
  | "configured"
  | "artwork_ready"
  | "proof_pending"
  | "proof_approved"
  | "payment_pending"
  | "paid";

export interface DraftOptions {
  widthMm: number;
  heightMm: number;
  materialId: string;
  orientation?: "portrait" | "landscape" | "square";
  bleedMm: number;
  safetyMarginMm: number;
}

export interface DraftProofRecord {
  version: number;
  renderedUrl: string;
  sha256Hash: string;
  createdAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  feedback?: string | null;
}

export interface DraftAuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorEmail: string;
  fromStatus: DraftStatus;
  toStatus: DraftStatus;
  action: string;
  details?: Record<string, unknown>;
}

export interface JobDraft {
  id: string;
  productId: string;
  productSlug: string;
  productName: string;
  divisionSlug: DivisionSlug;
  options: DraftOptions;
  quantity: number;
  designJson: Record<string, unknown> | null;
  uploadedFileRef: string | null;
  csvFileRef: string | null;
  proofVersion: number;
  proofs: DraftProofRecord[];
  status: DraftStatus;
  customerId: string | null;
  customerEmail: string | null;
  orderId: string | null;
  auditLog: DraftAuditLogEntry[];
  createdAt: string;
  updatedAt: string;
}
