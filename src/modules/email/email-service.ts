import { EmailPayload, EmailSendResult } from "./types";
import { renderEmail } from "./templates";
import { hasSuccessfulSend, recordEmailLog } from "./email-store";
import { sendTransactionalEmail } from "./email-provider";

export function generateIdempotencyKey(payload: EmailPayload): string {
  const orderRef = payload.orderNumber || payload.orderId;
  switch (payload.event) {
    case "order_confirmed":
      return `email:${orderRef}:order_confirmed`;
    case "proof_ready":
      return `email:${orderRef}:proof_ready:v${payload.version || 1}`;
    case "change_requested":
      return `email:${orderRef}:change_requested:v${payload.version || 1}`;
    case "proof_approved":
      return `email:${orderRef}:proof_approved:v${payload.version || 1}`;
    case "pipeline_status_changed":
      return `email:${orderRef}:pipeline_status_changed:${payload.stage || "UNKNOWN"}`;
    case "order_completed":
      return `email:${orderRef}:order_completed`;
    default:
      return `email:${orderRef}:${payload.event}:${Date.now()}`;
  }
}

/**
 * Sends a transactional email notification with exact-once delivery guarantee (PRD § 13).
 * Replays are deduplicated via idempotency key; failures are logged to the email_log table.
 */
export async function sendNotificationEmail(
  payload: EmailPayload
): Promise<EmailSendResult> {
  const idempotencyKey = generateIdempotencyKey(payload);

  // 1. Idempotency Check: prevent duplicate sends on webhook replays
  if (await hasSuccessfulSend(idempotencyKey)) {
    const skippedRecord = await recordEmailLog({
      idempotency_key: idempotencyKey,
      order_id: payload.orderId || payload.orderNumber,
      event: payload.event,
      recipient: payload.to,
      recipient_name: payload.recipientName || "Valued Customer",
      subject: `[Skipped Duplicate] ${payload.event}`,
      body_text: "Duplicate event detected via idempotency key. Email not resent.",
      body_html: "<p>Duplicate event detected via idempotency key. Email not resent.</p>",
      status: "skipped_duplicate",
      provider: "none",
      metadata: {
        replayedAt: new Date().toISOString(),
        orderNumber: payload.orderNumber,
      },
    });

    return {
      success: true,
      logId: skippedRecord.id,
      idempotencyKey,
      status: "skipped_duplicate",
    };
  }

  // 2. Render Template with customer-scoped data
  const { subject, text, html } = renderEmail(payload);

  // 3. Dispatch via transactional provider
  try {
    const dispatchResult = await sendTransactionalEmail({
      to: payload.to,
      subject,
      html,
      text,
      idempotencyKey,
    });

    // 4. Log successful send in email_log table
    const logRecord = await recordEmailLog({
      idempotency_key: idempotencyKey,
      order_id: payload.orderId || payload.orderNumber,
      event: payload.event,
      recipient: payload.to,
      recipient_name: payload.recipientName || "Valued Customer",
      subject: dispatchResult.deliveredSubject || subject,
      body_text: text,
      body_html: html,
      status: "sent",
      provider: dispatchResult.provider,
      provider_message_id: dispatchResult.messageId,
      metadata: {
        orderNumber: payload.orderNumber,
        version: payload.version,
        stage: payload.stage,
        extraData: payload.extraData,
        is_sandbox_redirect: dispatchResult.isSandboxRedirect,
        delivered_to: dispatchResult.deliveredTo,
        delivered_subject: dispatchResult.deliveredSubject,
      },
    });

    return {
      success: true,
      logId: logRecord.id,
      idempotencyKey,
      status: "sent",
      providerMessageId: dispatchResult.messageId,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Email provider dispatch failed";

    // 5. Log provider failure in email_log table
    const failRecord = await recordEmailLog({
      idempotency_key: idempotencyKey,
      order_id: payload.orderId || payload.orderNumber,
      event: payload.event,
      recipient: payload.to,
      recipient_name: payload.recipientName || "Valued Customer",
      subject,
      body_text: text,
      body_html: html,
      status: "failed",
      provider: process.env.EMAIL_PROVIDER || "unknown",
      error: errorMsg,
      metadata: {
        orderNumber: payload.orderNumber,
        version: payload.version,
        stage: payload.stage,
      },
    });

    return {
      success: false,
      logId: failRecord?.id,
      idempotencyKey,
      status: "failed",
      error: errorMsg,
    };
  }
}

/**
 * Resilient wrapper: ensures that a failure in the email provider NEVER blocks
 * the calling workflow (payment webhook, draft transition, or stage update).
 */
export async function safeSendNotificationEmail(
  payload: EmailPayload
): Promise<EmailSendResult> {
  try {
    return await sendNotificationEmail(payload);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unexpected email dispatch error";
    console.error("[EmailNotification] Provider failure intercepted:", errorMsg);

    const idempotencyKey = generateIdempotencyKey(payload);
    // Logging itself may be what failed (e.g. database unavailable): never throw from here.
    const failRecord = await recordEmailLog({
      idempotency_key: idempotencyKey,
      order_id: payload.orderId || payload.orderNumber,
      event: payload.event,
      recipient: payload.to,
      recipient_name: payload.recipientName || "Valued Customer",
      subject: `[Failed] ${payload.event}`,
      body_text: `Failure: ${errorMsg}`,
      body_html: `<p>Failure: ${errorMsg}</p>`,
      status: "failed",
      provider: process.env.EMAIL_PROVIDER || "unknown",
      error: errorMsg,
      metadata: { payloadSummary: payload.event },
    }).catch(() => null);

    return {
      success: false,
      logId: failRecord?.id,
      idempotencyKey,
      status: "failed",
      error: errorMsg,
    };
  }
}
