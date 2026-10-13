import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { battleSessionBinding, constantTimeEqual, sealWarcraftLogsValue, unsealWarcraftLogsValue, warcraftLogsAppRedirect, warcraftLogsRedirectURI, WCL_OAUTH_COOKIE, WCL_SESSION_COOKIE, WCL_TOKEN_URL, wclCookieOptions, type WarcraftLogsOAuthState, type WarcraftLogsSession } from "@/lib/wow/warcraftLogsAuth";

export const dynamic = "force-dynamic";

function redirect(request: Request, path: string) { return NextResponse.redirect(warcraftLogsAppRedirect(path, request.url)); }

export async function GET(request: Request) {
  const session = await auth(), jar = await cookies(), secret = process.env.AUTH_SECRET ?? "";
  const pending = unsealWarcraftLogsValue<WarcraftLogsOAuthState>(jar.get(WCL_OAUTH_COOKIE)?.value, secret);
  jar.delete(WCL_OAUTH_COOKIE);
  if (!session?.battleNetAccessToken || !pending || pending.binding !== battleSessionBinding(session.battleNetAccessToken)) return redirect(request, "/ru/wow/characters?logs=invalid_session#audit-logs");
  const url = new URL(request.url), state = url.searchParams.get("state") ?? "", code = url.searchParams.get("code") ?? "";
  if (!/^[A-Za-z0-9._~-]{1,2048}$/.test(code) || !constantTimeEqual(state, pending.state)) return redirect(request, `${pending.returnTo}${pending.returnTo.includes("?") ? "&" : "?"}logs=invalid_state#audit-logs`);
  try {
    const form = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: warcraftLogsRedirectURI(), code_verifier: pending.verifier });
    const basic = Buffer.from(`${process.env.WARCRAFT_LOGS_CLIENT_ID}:${process.env.WARCRAFT_LOGS_CLIENT_SECRET}`).toString("base64");
    const response = await fetch(WCL_TOKEN_URL, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: form, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const payload = await response.json() as { access_token?: string; expires_in?: number };
    if (!response.ok || !payload.access_token) throw new Error("token_exchange_failed");
    const ttl = Math.min(24 * 60 * 60, Math.max(60, Number(payload.expires_in ?? 3600)));
    const token: WarcraftLogsSession = { accessToken: payload.access_token, binding: pending.binding, exp: Date.now() + ttl * 1000 };
    jar.set(WCL_SESSION_COOKIE, sealWarcraftLogsValue(token, secret), wclCookieOptions(ttl));
    return redirect(request, `${pending.returnTo}${pending.returnTo.includes("?") ? "&" : "?"}logs=connected#audit-logs`);
  } catch {
    return redirect(request, `${pending.returnTo}${pending.returnTo.includes("?") ? "&" : "?"}logs=exchange_failed#audit-logs`);
  }
}
