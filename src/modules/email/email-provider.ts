import { dataFile } from "../../lib/data-dir";
import fs from "fs";
import crypto from "crypto";

// Ensure environment variables from .env.local are loaded if running in Node / scripts
try {
  if (!process.env.RESEND_API_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional, server/script-only dependency
    const { loadEnvConfig } = require("@next/env");
    loadEnvConfig(process.cwd());
  }
} catch {
  // Ignore in browser or environments without @next/env
}

export interface CapturedEmail {
  id: string;
  from: string;
  to: string;
  originalTo?: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
  isSandboxRedirect?: boolean;
  sentAt: string;
}

const CAPTURED_EMAILS_FILE = dataFile(".email-captured-sink.json");

let inMemoryCaptured: CapturedEmail[] = [];
let simulatedFailure: { enabled: boolean; error: string } = {
  enabled: false,
  error: "Simulated transactional provider outage (HTTP 503)",
};

function isTestEnv(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.npm_lifecycle_event === "test" ||
    process.env.EMAIL_PROVIDER === "test"
  );
}

function persistCapturedIfTest() {
  if (isTestEnv()) {
    try {
      fs.writeFileSync(CAPTURED_EMAILS_FILE, JSON.stringify(inMemoryCaptured, null, 2), "utf-8");
    } catch {
      // In sandbox/read-only environment, in-memory is sufficient
    }
  }
}

function loadCapturedIfTest() {
  if (isTestEnv()) {
    try {
      if (fs.existsSync(CAPTURED_EMAILS_FILE)) {
        const raw = fs.readFileSync(CAPTURED_EMAILS_FILE, "utf-8");
        inMemoryCaptured = JSON.parse(raw);
      }
    } catch {
      // Ignore read error
    }
  }
}

/**
 * Configure provider failure simulation for resilience testing (PRD § 13).
 */
export function simulateProviderFailure(enabled: boolean, errorMsg?: string) {
  simulatedFailure = {
    enabled,
    error: errorMsg || "Simulated transactional provider outage (HTTP 503)",
  };
}

/**
 * Query captured mail (only available in test environments).
 */
export function getCapturedEmails(): CapturedEmail[] {
  loadCapturedIfTest();
  return [...inMemoryCaptured];
}

/**
 * Clear captured test emails.
 */
export function clearCapturedEmails(): void {
  inMemoryCaptured = [];
  if (isTestEnv()) {
    try {
      if (fs.existsSync(CAPTURED_EMAILS_FILE)) {
        fs.unlinkSync(CAPTURED_EMAILS_FILE);
      }
    } catch {}
  }
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
}

export interface ProviderDispatchResult {
  messageId: string;
  provider: string;
  isSandboxRedirect: boolean;
  originalRecipient: string;
  deliveredTo: string;
  deliveredSubject: string;
}

/**
 * Dispatches an email through the transactional provider (Resend, Mailpit, or Capture Mode).
 * Keys are loaded strictly from environment variables without logging/hardcoding secrets (PRD § 13).
 */
export async function sendTransactionalEmail(
  opts: SendEmailOptions,
  forceLiveResend: boolean = false
): Promise<ProviderDispatchResult> {
  // 1. Check for simulated provider failure in tests
  if (simulatedFailure.enabled) {
    throw new Error(simulatedFailure.error);
  }

  // Handle Resend's official bounce test address
  if (opts.to === "bounced@resend.dev") {
    throw new Error("Resend simulation: 550 Mailbox does not exist (bounced@resend.dev)");
  }

  const fromAddress = process.env.EMAIL_FROM || "onboarding@resend.dev";
  const sandboxRecipient = process.env.EMAIL_SANDBOX_RECIPIENT;

  // 2. Recipient: always the customer's registered email. Sandbox redirection is an
  //    explicit opt-in (EMAIL_SANDBOX_MODE=true) for development accounts that cannot
  //    deliver to arbitrary addresses (e.g. Resend's onboarding@resend.dev sender).
  let targetTo = opts.to;
  let targetSubject = opts.subject;
  let isSandboxRedirect = false;
  if (process.env.EMAIL_SANDBOX_MODE === "true" && sandboxRecipient) {
    targetTo = sandboxRecipient;
    targetSubject = `[Sandbox to: ${opts.to}] ${opts.subject}`;
    isSandboxRedirect = true;
  }

  // 3. Provider: real delivery whenever a real provider is configured (any environment);
  //    the test provider only records messages.
  const provider = (process.env.EMAIL_PROVIDER || "test").toLowerCase();
  const apiKey = process.env.RESEND_API_KEY;
  const liveResend = forceLiveResend || (provider === "resend" && !isTestEnv());

  if (provider === "smtp" && !isTestEnv()) {
    return sendViaSmtp({ ...opts, to: targetTo, subject: targetSubject }, fromAddress, isSandboxRedirect, opts.to);
  }

  if (liveResend && (!apiKey || !apiKey.startsWith("re_") || apiKey.length < 10)) {
    console.error("[EmailProvider] RESEND_API_KEY is missing or invalid.");
    throw new Error("Invalid or missing RESEND_API_KEY.");
  }

  // 4. Live Resend Provider API Call (when forced or in production without test capture)
  if (liveResend) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [targetTo],
          subject: targetSubject,
          html: opts.html,
          text: opts.text,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Resend API error (${response.status}): ${errorData.message || response.statusText}`
        );
      }

      const resData = (await response.json()) as { id?: string };
      const messageId = resData.id || `resend-${Date.now()}`;

      return {
        messageId,
        provider: "resend",
        isSandboxRedirect,
        originalRecipient: opts.to,
        deliveredTo: targetTo,
        deliveredSubject: targetSubject,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transactional provider request failed";
      console.error("[EmailProvider] Resend API dispatch failed:", msg);
      throw new Error(`Transactional provider failure: ${msg}`);
    }
  }

  // 5. Test Mode (Used in test suite when NODE_ENV=test or EMAIL_PROVIDER=test)
  const messageId = `msg_test_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const captured: CapturedEmail = {
    id: messageId,
    from: fromAddress,
    to: targetTo,
    originalTo: opts.to,
    subject: targetSubject,
    html: opts.html,
    text: opts.text,
    idempotencyKey: opts.idempotencyKey,
    isSandboxRedirect,
    sentAt: new Date().toISOString(),
  };

  inMemoryCaptured.push(captured);
  persistCapturedIfTest();

  return {
    messageId,
    provider: "resend_sandbox_test",
    isSandboxRedirect,
    originalRecipient: opts.to,
    deliveredTo: targetTo,
    deliveredSubject: targetSubject,
  };
}

/**
 * SMTP delivery (e.g. Gmail with an app password, or any transactional SMTP relay).
 * EMAIL_PROVIDER=smtp, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM.
 */
async function sendViaSmtp(
  opts: SendEmailOptions,
  fromAddress: string,
  isSandboxRedirect: boolean,
  originalRecipient: string
): Promise<ProviderDispatchResult> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP_HOST, SMTP_USER and SMTP_PASS must be set when EMAIL_PROVIDER=smtp.");
  }
  const nodemailer = await import("nodemailer");
  const port = Number(SMTP_PORT || 465);
  const transport = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  const info = await transport.sendMail({
    from: fromAddress,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    headers: opts.idempotencyKey ? { "X-Entity-Ref-ID": opts.idempotencyKey } : undefined,
  });
  return {
    messageId: info.messageId || `smtp-${Date.now()}`,
    provider: "smtp",
    isSandboxRedirect,
    originalRecipient,
    deliveredTo: opts.to,
    deliveredSubject: opts.subject,
  };
}
