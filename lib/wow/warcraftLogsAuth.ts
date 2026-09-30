import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const WCL_OAUTH_COOKIE = "gildra_wcl_oauth";
export const WCL_SESSION_COOKIE = "gildra_wcl_session";
export const WCL_AUTHORIZE_URL = "https://www.warcraftlogs.com/oauth/authorize";
export const WCL_TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
export const WCL_USER_API_URL = "https://www.warcraftlogs.com/api/v2/user";

export type WarcraftLogsOAuthState = { state: string; verifier: string; returnTo: string; binding: string; exp: number };
export type WarcraftLogsSession = { accessToken: string; binding: string; exp: number };

function key(secret: string) { return createHash("sha256").update(`gildra:wcl:v1:${secret}`).digest(); }

export function sealWarcraftLogsValue(value: object, secret: string) {
  if (secret.length < 24) throw new Error("AUTH_SECRET is not configured");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function unsealWarcraftLogsValue<T extends { exp: number }>(value: string | undefined, secret: string, now = Date.now()): T | null {
  try {
    if (!value || secret.length < 24) return null;
    const packed = Buffer.from(value, "base64url");
    if (packed.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(secret), packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    const decoded = JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8")) as T;
    return Number.isFinite(decoded.exp) && decoded.exp > now ? decoded : null;
  } catch { return null; }
}

export function battleSessionBinding(accessToken: string) {
  return createHash("sha256").update(`gildra:bnet-session:${accessToken}`).digest("hex").slice(0, 32);
}

export function safeReturnTo(value: string | null) {
  if (!value || !/^\/(?:ru\/)?wow\/characters\/[A-Za-z0-9%._~-]+(?:\?.*)?$/.test(value)) return "/ru/wow/characters";
  return value;
}

export function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function configuredWarcraftLogs() {
  return Boolean(process.env.WARCRAFT_LOGS_CLIENT_ID && process.env.WARCRAFT_LOGS_CLIENT_SECRET && process.env.AUTH_SECRET);
}

export function warcraftLogsRedirectURI() {
  if (process.env.WARCRAFT_LOGS_REDIRECT_URI) return process.env.WARCRAFT_LOGS_REDIRECT_URI;
  return `${(process.env.AUTH_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "")}/api/wow/logs/callback`;
}

export function warcraftLogsAppRedirect(path: string, requestURL: string, appURL = process.env.AUTH_URL) {
  const base = appURL?.trim() ? new URL(appURL) : new URL(requestURL);
  if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("AUTH_URL must use http or https");
  return new URL(path, `${base.origin}/`);
}

export const wclCookieOptions = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge });
