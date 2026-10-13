import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRotationPreset } from "@/lib/platform/rotation/repository";
import { getMidnightTalentData } from "@/lib/talentCalculatorData";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { getBattleNetSimulationSnapshot, type BattleNetSimulationSnapshot } from "@/lib/wow/battleNetCharacterDetails";
import { getBattleNetCharacterBySlug } from "@/lib/wow/battleNetCharacters";
import { generateTalentCandidates } from "@/lib/wow/talentCandidateGenerator";
import { cancelTalentOptimizationJob, enqueueTalentOptimization, getTalentOptimizationJob } from "@/lib/wow/talentOptimizerJobs";
import { selectBoundedTalentCandidates, talentOptimizerEncounter, type TalentOptimizerScenario } from "@/lib/wow/talentOptimizer";
import { createSimcTalentOptimizerRunner } from "@/lib/wow/simcTalentOptimizerRunner";
import { FURY_REFERENCE_LOADOUT } from "@/lib/wowTalentLoadout";

export const dynamic = "force-dynamic";

type DataMode = "fixture" | "battle-net";
type RequestBody = { characterSlug?: string; spec?: string; scenario?: string; dataMode?: DataMode; maxCandidates?: number; lang?: "ru" | "en" };
const scenarios = new Set<TalentOptimizerScenario>(["solo-pve", "pve-aoe", "mythic-plus", "raid"]);
const rateWindows = new Map<string, { resetAt: number; count: number }>();

function reply(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: {
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "Referrer-Policy": "no-referrer",
    ...extraHeaders,
  } });
}

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return Boolean(host) && new URL(origin).host === host;
  } catch { return false; }
}

function remoteAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

async function ownerFor(request: Request, dataMode: DataMode) {
  const session = await auth();
  if (dataMode !== "fixture" && !session?.battleNetAccessToken) return null;
  const secret = dataMode === "fixture" ? `fixture:${remoteAddress(request)}` : `battle-net:${session!.battleNetAccessToken}`;
  return { id: createHash("sha256").update(secret).digest("hex"), accessToken: session?.battleNetAccessToken };
}

function takeRateLimit(owner: string) {
  const now = Date.now();
  const current = rateWindows.get(owner);
  if (!current || current.resetAt <= now) {
    rateWindows.set(owner, { resetAt: now + 60_000, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 3;
}

async function resolveRealArmory(accessToken: string, requestedSlug: string) {
  const character = await getBattleNetCharacterBySlug(accessToken, "ru", requestedSlug);
  return character ? getBattleNetSimulationSnapshot(accessToken, character) : null;
}

function armoryFingerprint(armory: BattleNetSimulationSnapshot | undefined, spec: string, baseline: string) {
  return createHash("sha256").update(JSON.stringify(armory ? {
    profile: armory.profile, specializations: armory.specializations, equipment: armory.equipment,
  } : { fixture: true, spec, baseline })).digest("hex");
}

function query(request: Request) {
  const url = new URL(request.url);
  return { id: url.searchParams.get("id") ?? "", dataMode: url.searchParams.get("dataMode") === "fixture" ? "fixture" as const : "battle-net" as const };
}

export async function GET(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "cross_site_blocked" }, 403);
  const { id, dataMode } = query(request);
  const owner = await ownerFor(request, dataMode);
  if (!owner) return reply({ error: "battle_net_session_required" }, 401);
  const job = id ? getTalentOptimizationJob(owner.id, id) : null;
  return job ? reply(job) : reply({ error: "optimizer_job_not_found" }, 404);
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "cross_site_blocked" }, 403);
  const { id, dataMode } = query(request);
  const owner = await ownerFor(request, dataMode);
  if (!owner) return reply({ error: "battle_net_session_required" }, 401);
  const job = id ? cancelTalentOptimizationJob(owner.id, id) : null;
  return job ? reply(job) : reply({ error: "optimizer_job_not_found" }, 404);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "cross_site_blocked" }, 403);
  if (Number(request.headers.get("content-length") ?? 0) > 2_048) return reply({ error: "request_too_large" }, 413);
  const body = await request.json().catch(() => null) as RequestBody | null;
  const dataMode: DataMode = body?.dataMode === "fixture" ? "fixture" : "battle-net";
  const owner = await ownerFor(request, dataMode);
  if (!owner) return reply({ error: "battle_net_session_required" }, 401);
  if (!takeRateLimit(owner.id)) return reply({ error: "optimizer_rate_limited" }, 429, { "Retry-After": "60" });
  const spec = body?.spec ?? "";
  const requestedSlug = body?.characterSlug ?? "";
  const scenario = body?.scenario ?? "";
  const theme = getTalentSpecTheme(spec);
  if (!theme || !requestedSlug || !scenarios.has(scenario as TalentOptimizerScenario)) return reply({ error: "invalid_optimizer_request" }, 400);

  try {
    let armory: BattleNetSimulationSnapshot | undefined;
    let baselineLoadout: string;
    let activeHeroTalentTreeId: number | undefined;
    if (dataMode === "fixture") {
      if (requestedSlug !== "furybar" || spec !== "fury-warrior") return reply({ error: "fixture_not_found" }, 404);
      baselineLoadout = FURY_REFERENCE_LOADOUT;
    } else {
      armory = await resolveRealArmory(owner.accessToken!, requestedSlug) ?? undefined;
      if (!armory) return reply({ error: "character_not_found" }, 404);
      if (armory.activeSpecializationId !== theme.specId) return reply({ error: "active_specialization_changed" }, 409);
      baselineLoadout = armory.activeTalentLoadout;
      activeHeroTalentTreeId = armory.activeHeroTalentTreeId;
    }
    const lang = body?.lang === "en" ? "en" : "ru";
    const talentData = await getMidnightTalentData(spec, activeHeroTalentTreeId, lang);
    const maxCandidates = Number.isInteger(body?.maxCandidates) ? Math.max(1, Math.min(24, Number(body!.maxCandidates))) : 8;
    // Candidate construction is cheap; keep a broad per-tree pool so early
    // utility choice nodes cannot crowd damage-changing rank swaps out of the
    // much smaller, expensive SimC budget below.
    const generatedCandidates = generateTalentCandidates(talentData, baselineLoadout, {
      maxCandidates: 384,
      maxCandidatesPerTree: 128,
      maxEvaluations: 50_000,
    });
    const candidates = selectBoundedTalentCandidates(generatedCandidates, maxCandidates);
    if (!candidates.length) return reply({ error: "no_valid_talent_candidates" }, 422);
    const preset = await getRotationPreset(spec, lang);
    if (!preset.defaultRules.length) return reply({ error: "apl_unavailable" }, 422);
    const selectedScenario = scenario as TalentOptimizerScenario;
    const job = enqueueTalentOptimization(owner.id, {
      spec,
      scenario: selectedScenario,
      encounter: talentOptimizerEncounter(selectedScenario),
      armoryFingerprint: armoryFingerprint(armory, spec, baselineLoadout),
      gameBuild: talentData.buildVersion,
      apl: preset.defaultRules,
      baselineLoadout,
      candidates,
    }, createSimcTalentOptimizerRunner(armory));
    return reply(job, 202, { Location: `/api/wow/talent-optimizer?id=${encodeURIComponent(job.id)}&dataMode=${dataMode}` });
  } catch (error) {
    const code = error instanceof Error ? error.message : "optimizer_start_failed";
    if (code === "optimizer_queue_full") return reply({ error: code }, 503, { "Retry-After": "5" });
    return reply({ error: "optimizer_start_failed" }, 503, { "Retry-After": "2" });
  }
}
