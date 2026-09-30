import { cookies } from "next/headers";
import { auth } from "@/auth";
import { WCL_SESSION_COOKIE } from "@/lib/wow/warcraftLogsAuth";
import { sameOrigin, secureJSON } from "../_shared";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return secureJSON({ error: "cross_site_blocked" }, 403);
  const session = await auth();
  if (!session?.battleNetAccessToken) return secureJSON({ error: "battle_net_session_required" }, 401);
  (await cookies()).delete(WCL_SESSION_COOKIE);
  return secureJSON({ connected: false });
}
