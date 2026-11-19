import { db, unwrap } from "@/lib/supabase/server";
import { EmailLogRecord } from "./types";

/**
 * Email log repository (public.email_logs). A partial unique index guarantees at
 * most one SENT row per idempotency key, which backs the exactly-once guarantee.
 */

interface EmailLogRow {
  id: string;
  idempotency_key: string;
  order_ref: string;
  event: EmailLogRecord["event"];
  recipient: string;
  recipient_name: string;
  subject: string;
  body_text: string;
  body_html: string;
  status: EmailLogRecord["status"];
  provider: string;
  provider_message_id: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

function toRecord(row: EmailLogRow): EmailLogRecord {
  return {
    id: row.id,
    idempotency_key: row.idempotency_key,
    order_id: row.order_ref,
    event: row.event,
    recipient: row.recipient,
    recipient_name: row.recipient_name,
    subject: row.subject,
    body_text: row.body_text,
    body_html: row.body_html,
    status: row.status,
    provider: row.provider,
    provider_message_id: row.provider_message_id ?? undefined,
    error: row.error ?? undefined,
    metadata: row.metadata,
    created_at: row.created_at,
  };
}

/** True when an email with this idempotency key has already been sent. */
export async function hasSuccessfulSend(idempotencyKey: string): Promise<boolean> {
  const { count, error } = await db()
    .from("email_logs")
    .select("id", { count: "exact", head: true })
    .eq("idempotency_key", idempotencyKey)
    .eq("status", "sent");
  if (error) throw new Error(`Check email log: ${error.message}`);
  return (count ?? 0) > 0;
}

/** Records a dispatch attempt. Throws on a duplicate SENT row (unique index). */
export async function recordEmailLog(entry: Omit<EmailLogRecord, "id" | "created_at">): Promise<EmailLogRecord> {
  const row = unwrap(
    await db()
      .from("email_logs")
      .insert({
        idempotency_key: entry.idempotency_key,
        order_ref: entry.order_id,
        event: entry.event,
        recipient: entry.recipient,
        recipient_name: entry.recipient_name,
        subject: entry.subject,
        body_text: entry.body_text,
        body_html: entry.body_html,
        status: entry.status,
        provider: entry.provider,
        provider_message_id: entry.provider_message_id ?? null,
        error: entry.error ?? null,
        metadata: entry.metadata ?? {},
      })
      .select("*")
      .single(),
    "Record email log"
  );
  return toRecord(row as EmailLogRow);
}

export async function getEmailLogs(options?: {
  orderId?: string;
  recipient?: string;
  event?: string;
  limit?: number;
}): Promise<EmailLogRecord[]> {
  let query = db().from("email_logs").select("*").order("created_at", { ascending: false });
  if (options?.orderId) query = query.eq("order_ref", options.orderId);
  if (options?.recipient) query = query.eq("recipient", options.recipient.toLowerCase().trim());
  if (options?.event) query = query.eq("event", options.event);
  query = query.limit(options?.limit ?? 200);
  const rows = unwrap(await query, "Load email logs");
  return (rows as EmailLogRow[]).map(toRecord);
}
