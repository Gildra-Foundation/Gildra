import { cookies } from "next/headers";
import { auth } from "@/auth";
import { battleSessionBinding, configuredWarcraftLogs, unsealWarcraftLogsValue, WCL_SESSION_COOKIE, type WarcraftLogsSession } from "@/lib/wow/warcraftLogsAuth";
import { secureJSON } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.battleNetAccessToken) return secureJSON({ configured: configuredWarcraftLogs(), connected: false, error: "battle_net_session_required" }, 401);
  const wcl = unsealWarcraftLogsValue<WarcraftLogsSession>((await cookies()).get(WCL_SESSION_COOKIE)?.value, process.env.AUTH_SECRET ?? "");
  return secureJSON({ configured: configuredWarcraftLogs(), connected: Boolean(wcl && wcl.binding === battleSessionBinding(session.battleNetAccessToken)) });
}
