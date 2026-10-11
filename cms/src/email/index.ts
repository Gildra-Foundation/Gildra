import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import { APIError, type EmailAdapter, type SendEmailOptions } from "payload";

export type EmailMode = "smtp" | "capture" | "disabled";
type NodemailerTransportOptions = NonNullable<Parameters<typeof nodemailerAdapter>[0]>["transportOptions"];

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
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailerAdapter({
    defaultFromAddress: fromAddress(),
    defaultFromName: fromName(),
    // Do not block CMS startup on SMTP reachability; failures surface per message.
    skipVerify: true,
    // Passed to nodemailer.createTransport, which accepts `auth`; nodemailer 10's
    // own SMTPConnectionOptions type (used by the adapter's signature) omits it.
    transportOptions: {
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
    } as NodemailerTransportOptions,
  });
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
