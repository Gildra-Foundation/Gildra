import { reportQuery, WarcraftLogsError, warcraftLogsGraphQL } from "@/lib/wow/warcraftLogs";
import { cookies } from "next/headers";
import { WCL_SESSION_COOKIE } from "@/lib/wow/warcraftLogsAuth";
import { secureJSON, warcraftLogsContext } from "../_shared";
import { analyzableWarcraftLogsFights, resolveWarcraftLogsActor } from "@/lib/wow/warcraftLogsReport";

export const dynamic = "force-dynamic";
const reportCode = /^[A-Za-z0-9]{16}$/;

type ReportPayload = { reportData: { report: null | { code: string; title: string; visibility: string; startTime: number; endTime: number; zone?: { name?: string }; fights: Array<{ id: number; name: string; encounterID: number; startTime: number; endTime: number; kill: boolean; difficulty?: number; friendlyPlayers?: number[]; friendlySpecs?: string[] }>; masterData: { actors: Array<{ id: number; name: string; server?: string; type?: string; subType?: string }>; abilities: Array<{ gameID: number; name: string }> } } } };

async function errorResponse(error: unknown) {
  if (error instanceof WarcraftLogsError) {
    if (error.code === "unauthorized") (await cookies()).delete(WCL_SESSION_COOKIE);
    return secureJSON({ error: error.code === "unauthorized" ? "warcraft_logs_session_expired" : error.code }, error.status);
  }
  return secureJSON({ error: "warcraft_logs_unavailable" }, 503);
}

export async function GET(request: Request) {
  const context = await warcraftLogsContext();
  if ("error" in context) return secureJSON({ error: context.error }, 401);
  const url = new URL(request.url), code = url.searchParams.get("code") ?? "", character = url.searchParams.get("character") ?? "";
  if (!reportCode.test(code) || character.length > 256) return secureJSON({ error: "invalid_report_request" }, 400);
  try {
    const payload = await warcraftLogsGraphQL<ReportPayload>(context.wcl.accessToken, reportQuery, { code });
    const report = payload.reportData.report;
    if (!report) return secureJSON({ error: "report_not_found" }, 404);
    const resolution = resolveWarcraftLogsActor(character, report.masterData.actors);
    if (resolution.error === "invalid_character_slug") return secureJSON({ error: resolution.error }, 400);
    if (resolution.error === "character_ambiguous") return secureJSON({ error: resolution.error }, 409);
    if (resolution.error) return secureJSON({ error: resolution.error }, 404);
    const actor = resolution.actor;
    const availableFights = analyzableWarcraftLogsFights(report.fights, actor.id);
    if (!availableFights.length) return secureJSON({ error: "character_has_no_fights" }, 422);
    const fights = availableFights.map((fight) => {
      const index = fight.friendlyPlayers!.indexOf(actor.id);
      return { id: fight.id, name: fight.name, encounterID: fight.encounterID, durationSeconds: (fight.endTime - fight.startTime) / 1000, kill: fight.kill, difficulty: fight.difficulty, specialization: fight.friendlySpecs?.[index] ?? "Unknown" };
    });
    return secureJSON({ report: { code: report.code, title: report.title, visibility: report.visibility, zone: report.zone?.name ?? "" }, actor: { id: actor.id, name: actor.name, server: actor.server ?? "", class: actor.subType ?? "" }, fights });
  } catch (error) { return await errorResponse(error); }
}
