import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import nodemailer from "nodemailer";
import { APIError, type EmailAdapter, type SendEmailOptions } from "payload";

export type EmailMode = "smtp" | "capture" | "disabled";

/**
 * - `smtp`: EMAIL_TRANSPORT=smtp with SMTP_HOST and EMAIL_FROM_ADDRESS.
 * - `capture`: EMAIL_TRANSPORT=capture, refused when NODE_ENV=production;
 *   messages stay in process memory for tests.
 * - `disabled`: anything else. Sending fails with HTTP 503 and nothing — not
 *   even the recipient or a link — is written to logs (Payload's default
 *   console adapter would print verification/reset links).
 */
export function emailMode(): EmailMode {
  const transport = process.env.EMAIL_TRANSPORT;
  if (transport === "capture" && process.env.NODE_ENV !== "production") return "capture";
  if (transport === "smtp" && process.env.SMTP_HOST && process.env.EMAIL_FROM_ADDRESS) return "smtp";
  return "disabled";
}

export type CapturedEmail = { to: string; subject: string; html: string };

const store = globalThis as typeof globalThis & { __gildraCapturedEmail?: CapturedEmail[] };

export function capturedEmails(): CapturedEmail[] {
  return (store.__gildraCapturedEmail ??= []);
}

export function clearCapturedEmails(): void {
  store.__gildraCapturedEmail = [];
}

const fromAddress = () => process.env.EMAIL_FROM_ADDRESS || "no-reply@localhost";
const fromName = () => process.env.EMAIL_FROM_NAME || "Gildra Network";

function smtpTransport() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    // Submission must not fall back to sending credentials over plain SMTP.
    requireTLS: process.env.NODE_ENV === "production" && !secure,
    tls: { minVersion: "TLSv1.2" },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    logger: false,
    debug: false,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
  });
}

/** Check service availability before looking up any staff recovery address. */
export async function assertStaffRecoveryAvailable(): Promise<void> {
  const unavailable = () => new APIError("Password recovery is unavailable. Contact a platform owner.", 503, undefined, true);
  const mode = emailMode();
  if (mode === "disabled") throw unavailable();
  if (mode !== "smtp") return;
  const transport = smtpTransport();
  try {
    await transport.verify();
  } catch {
    // Known and unknown accounts receive the same response when SMTP is down.
    throw unavailable();
  } finally {
    transport.close();
  }
}

function recipients(to: SendEmailOptions["to"]): string {
  const out: string[] = [];
  const walk = (item: unknown) => {
    if (Array.isArray(item)) item.forEach(walk);
    else if (typeof item === "string") out.push(item);
    else if (item && typeof item === "object" && typeof (item as { address?: unknown }).address === "string") out.push((item as { address: string }).address);
  };
  walk(to);
  return out.join(",");
}

const captureAdapter: EmailAdapter = () => ({
  name: "gildra-capture",
  defaultFromAddress: fromAddress(),
  defaultFromName: fromName(),
  sendEmail: async (message) => {
    capturedEmails().push({ to: recipients(message.to), subject: String(message.subject ?? ""), html: String(message.html ?? "") });
    return { captured: true };
  },
});

const disabledAdapter: EmailAdapter = ({ payload }) => ({
  name: "gildra-disabled",
  defaultFromAddress: fromAddress(),
  defaultFromName: fromName(),
  sendEmail: async () => {
    payload.logger.warn("Email delivery is not configured; a message was refused (content suppressed).");
    throw new APIError("Email delivery is not configured.", 503, undefined, true);
  },
});

export function buildEmailAdapter(): EmailAdapter | Promise<EmailAdapter> {
  const mode = emailMode();
  if (mode === "capture") return captureAdapter;
  if (mode === "disabled") return disabledAdapter;
  return nodemailerAdapter({
    defaultFromAddress: fromAddress(),
    defaultFromName: fromName(),
    // Do not block CMS startup on SMTP reachability; failures surface per message.
    skipVerify: true,
    transport: smtpTransport(),
  }).then((create): EmailAdapter => (args) => {
    const adapter = create(args);
    return {
      ...adapter,
      sendEmail: async (message) => {
        try {
          return await adapter.sendEmail(message);
        } catch {
          // SMTP errors can contain recipient addresses and transport details.
          throw new APIError("Email delivery is temporarily unavailable. Please try again later.", 503, undefined, true);
        }
      },
    };
  });
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
