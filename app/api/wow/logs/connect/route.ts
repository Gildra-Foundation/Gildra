import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { battleSessionBinding, configuredWarcraftLogs, pkceChallenge, safeReturnTo, sealWarcraftLogsValue, warcraftLogsRedirectURI, WCL_AUTHORIZE_URL, WCL_OAUTH_COOKIE, wclCookieOptions, type WarcraftLogsOAuthState } from "@/lib/wow/warcraftLogsAuth";
import { secureJSON } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.battleNetAccessToken) return secureJSON({ error: "battle_net_session_required" }, 401);
  if (!configuredWarcraftLogs()) return secureJSON({ error: "warcraft_logs_not_configured" }, 503);
  const state = randomBytes(32).toString("base64url"), verifier = randomBytes(64).toString("base64url");
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  const value: WarcraftLogsOAuthState = { state, verifier, returnTo, binding: battleSessionBinding(session.battleNetAccessToken), exp: Date.now() + 10 * 60_000 };
  const sealed = sealWarcraftLogsValue(value, process.env.AUTH_SECRET!);
  const jar = await cookies();
  jar.set(WCL_OAUTH_COOKIE, sealed, wclCookieOptions(10 * 60));
  const authorize = new URL(WCL_AUTHORIZE_URL);
  authorize.searchParams.set("client_id", process.env.WARCRAFT_LOGS_CLIENT_ID!);
  authorize.searchParams.set("redirect_uri", warcraftLogsRedirectURI());
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", pkceChallenge(verifier));
  authorize.searchParams.set("code_challenge_method", "S256");
  return NextResponse.redirect(authorize);
}
