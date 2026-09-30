import { analyzeWarcraftLog, type AnalyzePayload, type WarcraftLogsCooldownReference, type WarcraftLogsEvent } from "@/lib/wow/warcraftLogsAnalysis";
import { analysisQuery, eventPageQuery, WarcraftLogsError, warcraftLogsGraphQL } from "@/lib/wow/warcraftLogs";
import { cookies } from "next/headers";
import { WCL_SESSION_COOKIE } from "@/lib/wow/warcraftLogsAuth";
import { sameOrigin, secureJSON, warcraftLogsContext } from "../_shared";
import { resolveWarcraftLogsActor } from "@/lib/wow/warcraftLogsReport";

const reportCode = /^[A-Za-z0-9]{16}$/;

type Input = { locale?: "en" | "ru"; code?: string; characterSlug?: string; fightID?: number; actorID?: number; specSlug?: string; simDps?: number; simDurationSeconds?: number; simTargets?: number; cooldowns?: WarcraftLogsCooldownReference[] };
type EventPage = { reportData: { report: { events: { data: WarcraftLogsEvent[]; nextPageTimestamp?: number } } | null } };

async function completeEvents(accessToken: string, code: string, fightID: number, actorID: number, type: "Casts" | "Buffs" | "Resources" | "Deaths", first: { data: unknown; nextPageTimestamp?: number }) {
  const combined = Array.isArray(first.data) ? [...first.data] : [];
  let next = first.nextPageTimestamp;
  for (let page = 0; next && page < 8; page += 1) {
    const payload = await warcraftLogsGraphQL<EventPage>(accessToken, eventPageQuery, { code, fight: [fightID], actor: type === "Deaths" ? null : actorID, type, start: next, resources: type === "Resources" });
    const batch = payload.reportData.report?.events;
    if (!batch) break;
    if (Array.isArray(batch.data)) combined.push(...batch.data);
    next = batch.nextPageTimestamp;
  }
  if (next) throw new Error("event_limit_exceeded");
  return { data: combined };
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return secureJSON({ error: "cross_site_blocked" }, 403);
  const context = await warcraftLogsContext();
  if ("error" in context) return secureJSON({ error: context.error }, 401);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 32 * 1024) return secureJSON({ error: "payload_too_large" }, 413);
  const body = (() => { try { return JSON.parse(text) as Input; } catch { return null; } })();
  const cooldowns = Array.isArray(body?.cooldowns) ? body.cooldowns.slice(0, 20) : [];
  if (!body || !reportCode.test(body.code ?? "") || typeof body.characterSlug !== "string" || body.characterSlug.length < 3 || body.characterSlug.length > 256 || !Number.isInteger(body.fightID) || Number(body.fightID) < 1 || !Number.isInteger(body.actorID) || Number(body.actorID) < 1 || !/^[a-z0-9-]{2,64}$/.test(body.specSlug ?? "") || (body.simDps !== undefined && (!Number.isFinite(body.simDps) || body.simDps < 0 || body.simDps > 1e9)) || (body.simDurationSeconds !== undefined && (!Number.isFinite(body.simDurationSeconds) || body.simDurationSeconds < 1 || body.simDurationSeconds > 3600)) || (body.simTargets !== undefined && (!Number.isInteger(body.simTargets) || body.simTargets < 1 || body.simTargets > 40)) || cooldowns.some((item) => !Number.isInteger(item.spellId) || item.spellId < 1 || item.spellId > 10_000_000 || typeof item.name !== "string" || item.name.length > 100 || !Number.isFinite(item.expectedIntervalSeconds) || item.expectedIntervalSeconds < 1 || item.expectedIntervalSeconds > 600 || (item.expectedFirstUseSeconds !== undefined && (!Number.isFinite(item.expectedFirstUseSeconds) || item.expectedFirstUseSeconds < 0 || item.expectedFirstUseSeconds > 3600)) || (item.expectedUses !== undefined && (!Array.isArray(item.expectedUses) || item.expectedUses.length > 20 || item.expectedUses.some((time) => !Number.isFinite(time) || time < 0 || time > 3600))))) return secureJSON({ error: "invalid_analysis_request" }, 400);
  try {
    const payload = await warcraftLogsGraphQL<AnalyzePayload>(context.wcl.accessToken, analysisQuery, { code: body.code, fight: [body.fightID], actor: body.actorID });
    const report = payload.reportData.report;
    if (!report) return secureJSON({ error: "report_not_found" }, 404);
    const resolution = resolveWarcraftLogsActor(body.characterSlug!, report.masterData.actors);
    if (resolution.error || resolution.actor.id !== body.actorID) return secureJSON({ error: "character_actor_mismatch" }, 422);
    const completed = await Promise.all([
      completeEvents(context.wcl.accessToken, body.code!, body.fightID!, body.actorID!, "Casts", report.casts),
      completeEvents(context.wcl.accessToken, body.code!, body.fightID!, body.actorID!, "Buffs", report.buffs),
      completeEvents(context.wcl.accessToken, body.code!, body.fightID!, body.actorID!, "Resources", report.resources),
      completeEvents(context.wcl.accessToken, body.code!, body.fightID!, body.actorID!, "Deaths", report.deaths),
    ]);
    [report.casts, report.buffs, report.resources, report.deaths] = completed;
    const result = analyzeWarcraftLog(payload, { fightID: body.fightID!, actorID: body.actorID!, specSlug: body.specSlug!, locale: body.locale === "en" ? "en" : "ru", simDps: body.simDps, simDurationSeconds: body.simDurationSeconds, simTargets: body.simTargets, cooldowns });
    return secureJSON(result);
  } catch (error) {
    if (error instanceof WarcraftLogsError) {
      if (error.code === "unauthorized") (await cookies()).delete(WCL_SESSION_COOKIE);
      return secureJSON({ error: error.code === "unauthorized" ? "warcraft_logs_session_expired" : error.code }, error.status);
    }
    const code = error instanceof Error ? error.message : "analysis_failed";
    if (["report_not_found", "fight_actor_not_found", "specialization_mismatch", "character_actor_mismatch", "event_limit_exceeded"].includes(code)) return secureJSON({ error: code }, 422);
    return secureJSON({ error: "warcraft_logs_unavailable" }, 503);
  }
}
