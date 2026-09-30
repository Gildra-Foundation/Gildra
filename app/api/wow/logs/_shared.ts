import { cookies } from "next/headers";
import { auth } from "@/auth";
import { battleSessionBinding, unsealWarcraftLogsValue, WCL_SESSION_COOKIE, type WarcraftLogsSession } from "@/lib/wow/warcraftLogsAuth";

export function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === (request.headers.get("x-forwarded-host") ?? request.headers.get("host")); }
  catch { return false; }
}

export function secureJSON(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function warcraftLogsContext() {
  const session = await auth();
  if (!session?.battleNetAccessToken) return { error: "battle_net_session_required" as const };
  const secret = process.env.AUTH_SECRET ?? "";
  const sealed = (await cookies()).get(WCL_SESSION_COOKIE)?.value;
  const wcl = unsealWarcraftLogsValue<WarcraftLogsSession>(sealed, secret);
  if (!wcl || wcl.binding !== battleSessionBinding(session.battleNetAccessToken)) return { error: "warcraft_logs_session_required" as const };
  return { session, wcl };
}
