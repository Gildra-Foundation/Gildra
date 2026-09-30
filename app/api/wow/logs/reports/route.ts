import { currentUserQuery, userReportsQuery, WarcraftLogsError, warcraftLogsGraphQL } from "@/lib/wow/warcraftLogs";
import { cookies } from "next/headers";
import { WCL_SESSION_COOKIE } from "@/lib/wow/warcraftLogsAuth";
import { secureJSON, warcraftLogsContext } from "../_shared";

export const dynamic = "force-dynamic";
type UserPayload = { userData: { currentUser: { id: number; name: string } | null } };
type ReportsPayload = { reportData: { reports: { data: Array<{ code: string; title: string; visibility: string; startTime: number; endTime: number; zone?: { name?: string } }>; total: number } } };

export async function GET() {
  const context = await warcraftLogsContext();
  if ("error" in context) return secureJSON({ error: context.error }, 401);
  try {
    const user = await warcraftLogsGraphQL<UserPayload>(context.wcl.accessToken, currentUserQuery, {});
    if (!user.userData.currentUser) return secureJSON({ error: "warcraft_logs_user_not_found" }, 404);
    const payload = await warcraftLogsGraphQL<ReportsPayload>(context.wcl.accessToken, userReportsQuery, { user: user.userData.currentUser.id });
    return secureJSON({ reports: payload.reportData.reports.data.map((report) => ({ code: report.code, title: report.title, visibility: report.visibility, startTime: report.startTime, endTime: report.endTime, zone: report.zone?.name ?? "" })), total: payload.reportData.reports.total });
  } catch (error) {
    if (error instanceof WarcraftLogsError) {
      if (error.code === "unauthorized") (await cookies()).delete(WCL_SESSION_COOKIE);
      return secureJSON({ error: error.code === "unauthorized" ? "warcraft_logs_session_expired" : error.code }, error.status);
    }
    return secureJSON({ error: "warcraft_logs_unavailable" }, 503);
  }
}
