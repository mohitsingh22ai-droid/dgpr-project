/**
 * Email Notification Types & Schemas (PRD § 13)
 * Non-negotiable: Email notifications — order updates, proof status, completion alerts.
 */

export type EmailEvent =
  | "order_confirmed"
  | "proof_ready"
  | "change_requested"
  | "proof_approved"
  | "pipeline_status_changed"
  | "order_completed";

export interface EmailShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  postal_code: string;
  country: string;
}

export interface EmailOrderItem {
  name: string;
  quantity: number;
  amount: string;
  dimensions?: string;
  material?: string;
}

export interface EmailPayload {
  to: string;
  recipientName?: string;
  event: EmailEvent;
  orderId: string;
  orderNumber: string;
  version?: number;
  stage?: string;
  feedback?: string;
  proofHash?: string;
  previewUrl?: string;
  items?: EmailOrderItem[];
  subtotalFormatted?: string;
  taxFormatted?: string;
  totalFormatted?: string;
  currency?: string;
  shippingAddress?: EmailShippingAddress;
  extraData?: Record<string, unknown>;
}

export interface EmailLogRecord {
  id: string;
  idempotency_key: string;
  order_id: string;
  event: EmailEvent;
  recipient: string;
  recipient_name: string;
  subject: string;
  body_text: string;
  body_html: string;
  status: "sent" | "failed" | "skipped_duplicate";
  provider: string;
  provider_message_id?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface EmailSendResult {
  success: boolean;
  logId?: string;
  idempotencyKey: string;
  status: "sent" | "failed" | "skipped_duplicate";
  providerMessageId?: string;
  error?: string;
}
