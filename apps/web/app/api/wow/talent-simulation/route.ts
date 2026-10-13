import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { getRotationPreset } from "@/lib/platform/rotation/repository";
import type { RotationScenario, RotationSimulationResult } from "@/lib/platform/rotation/types";
import { getBattleNetSimulationSnapshot, type BattleNetSimulationSnapshot } from "@/lib/wow/battleNetCharacterDetails";
import { getBattleNetCharacterBySlug } from "@/lib/wow/battleNetCharacters";
import { getTestCharacter } from "@/lib/wow/testCharacters";
import { talentSimulationIntegrityError } from "@/lib/wow/talentSimulationIntegrity";

export const dynamic = "force-dynamic";

const workerURL = () => (process.env.ROTATION_WORKER_URL ?? "http://127.0.0.1:58082").replace(/\/$/, "");
const loadoutPattern = /^[A-Za-z0-9+/=_-]{20,512}$/;
const pveScenarios = new Set(["solo-pve", "pve-aoe", "mythic-plus", "raid"]);
type SimulatedStats = { primary: number; crit: number; haste: number; mastery: number; versatility: number };
type CachedSimulation = { expires: number; dps: number; dpsError: number; engine: string; iterations: number; confidence: number; modelNotice: string; combatStats: SimulatedStats };
const cache = new Map<string, CachedSimulation>();
const inFlight = new Map<string, Promise<CachedSimulation>>();
const rateWindows = new Map<string, { resetAt: number; count: number }>();
const armoryCache = new Map<string, { expires: number; snapshot: BattleNetSimulationSnapshot }>();

type RequestBody = { characterSlug?: string; spec?: string; scenario?: string; candidateLoadout?: string; baselineLoadout?: string; editDistance?: number; addedRanks?: number; removedRanks?: number; dataMode?: "fixture" | "battle-net" };

class SimulationWorkerError extends Error {
  constructor(public readonly status: number, public readonly code?: string) {
    super(`SimulationCraft unavailable (${status})`);
  }
}

function secureJson(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      ...extraHeaders,
    },
  });
}

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const expectedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return Boolean(expectedHost) && new URL(origin).host === expectedHost;
  } catch { return false; }
}

async function resolveArmory(accessToken: string, requestedCharacterSlug: string) {
  const requested = decodeURIComponent(requestedCharacterSlug).toLowerCase();
  const key = createHash("sha256").update(`${accessToken}:${requested}`).digest("hex");
  const cached = armoryCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.snapshot;
  const character = await getBattleNetCharacterBySlug(accessToken, "ru", requestedCharacterSlug);
  if (!character) return null;
  const snapshot = await getBattleNetSimulationSnapshot(accessToken, character);
  armoryCache.set(key, { expires: Date.now() + 60_000, snapshot });
  if (armoryCache.size > 100) armoryCache.delete(armoryCache.keys().next().value as string);
  return snapshot;
}

async function simulate(spec: string, scenario: RotationScenario, duration: number, targets: number, rules: string[], talentLoadout: string, armory: BattleNetSimulationSnapshot | undefined, profileFingerprint: string, signal: AbortSignal) {
  const key = `${profileFingerprint}:${spec}:${scenario}:${duration}:${targets}:${rules.join(",")}:${talentLoadout}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(`${workerURL()}/v1/wow/rotation/simulations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          spec, scenario, fightLengthSeconds: duration, targets, rules, talentLoadout,
          armory: armory ? { profile: armory.profile, specializations: armory.specializations, equipment: armory.equipment } : undefined,
        }),
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(50_000)]),
      });
      if (!response.ok || response.headers.get("x-gildra-engine") !== "simulationcraft") {
        const problem = await response.json().catch(() => ({})) as { code?: string };
        throw new SimulationWorkerError(response.status, problem.code);
      }
      const payload = await response.json() as RotationSimulationResult & { combatStats?: SimulatedStats };
      if (!Number.isFinite(payload.dps) || !payload.engine.startsWith("SimulationCraft")) throw new Error("Invalid SimulationCraft response");
      const combatStats = payload.combatStats;
      if (!combatStats || Object.values(combatStats).some((value) => !Number.isFinite(value))) throw new Error("Invalid SimulationCraft stat response");
      const result = { dps: payload.dps, dpsError: Math.max(0, payload.dpsError ?? 0), engine: payload.engine, iterations: payload.iterations, confidence: payload.confidence || 95, modelNotice: payload.modelNotice, combatStats, expires: Date.now() + 10 * 60_000 };
      cache.set(key, result);
      if (cache.size > 200) cache.delete(cache.keys().next().value as string);
      return result;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!sameOrigin(request)) return secureJson({ error: "Запрос с другого сайта заблокирован." }, 403);
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (Number(request.headers.get("content-length") ?? 0) > 2_048) return secureJson({ error: "Запрос слишком большой." }, 413);
  let body: RequestBody;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2_048) return secureJson({ error: "Запрос слишком большой." }, 413);
    body = JSON.parse(raw) as RequestBody;
  } catch { return secureJson({ error: "Некорректный запрос." }, 400); }
  const referenceMode = body.dataMode === "fixture";
  if (!referenceMode && !session?.battleNetAccessToken) return secureJson({ error: "Сессия Battle.net закончилась. Войдите ещё раз и повторите расчёт." }, 401);
  const identity = createHash("sha256").update(`${session?.battleNetAccessToken ?? "reference"}:${address}`).digest("hex").slice(0, 24);
  const now = Date.now();
  const window = rateWindows.get(identity);
  if (!window || window.resetAt <= now) rateWindows.set(identity, { resetAt: now + 60_000, count: 1 });
  else if (++window.count > 12) return secureJson({ error: "Слишком много расчётов. Подождите минуту." }, 429, { "Retry-After": "60" });
  const spec = body.spec ?? "";
  const scenario = body.scenario ?? "";
  const candidate = body.candidateLoadout ?? "";
  const requestedBaseline = body.baselineLoadout ?? "";
  const editDistance = body.editDistance;
  const addedRanks = body.addedRanks;
  const removedRanks = body.removedRanks;
  const requestedCharacterSlug = body.characterSlug ?? "";
  const theme = getTalentSpecTheme(spec);
  const validEditCounts = [editDistance, addedRanks, removedRanks].every((value) => Number.isInteger(value) && value! >= 0 && value! <= 300);
  if (!theme || !requestedCharacterSlug || !loadoutPattern.test(candidate) || !validEditCounts) return secureJson({ error: "Не удалось прочитать персонажа или его билд." }, 400);
  if (!pveScenarios.has(scenario)) return secureJson({ error: "SimulationCraft не рассчитывает PvP-бои. Для PvP покажем данные, когда подключим отдельный рейтинговый источник." }, 422);

  try {
    const fixture = referenceMode ? getTestCharacter(requestedCharacterSlug) : null;
    if (referenceMode && (!fixture || fixture.specialization.slug !== spec)) return secureJson({ error: "Тестовый профиль не соответствует выбранной специализации." }, 400);
    const armory = referenceMode ? undefined : (await resolveArmory(session!.battleNetAccessToken!, requestedCharacterSlug) ?? undefined);
    if (!referenceMode && !armory) return secureJson({ error: "Этот персонаж не найден в подключённом Battle.net-аккаунте." }, 404);
    if (armory && armory.activeSpecializationId !== theme.specId) return secureJson({ error: "Активная специализация персонажа изменилась. Обновите страницу." }, 409);
    const baseline = referenceMode ? requestedBaseline : armory!.activeTalentLoadout;
    if (!loadoutPattern.test(baseline)) return secureJson({ error: "Battle.net не отдал активный билд персонажа." }, 422);
    const profileFingerprint = referenceMode ? `reference:${spec}` : createHash("sha256").update(JSON.stringify({ profile: armory!.profile, specializations: armory!.specializations, equipment: armory!.equipment })).digest("hex");
    const preset = await getRotationPreset(spec, "ru");
    if (!preset.defaultRules.length) throw new Error("No action priority list");
    const encounter = {
      "solo-pve": { duration: 45, aoeTargets: 3 },
      "pve-aoe": { duration: 45, aoeTargets: 8 },
      "mythic-plus": { duration: 60, aoeTargets: 5 },
      raid: { duration: 180, aoeTargets: 2 },
    }[scenario] ?? { duration: 90, aoeTargets: 5 };
    const baselineSingle = await simulate(spec, "single-target", encounter.duration, 1, preset.defaultRules, baseline, armory, profileFingerprint, request.signal);
    const candidateSingle = candidate === baseline ? baselineSingle : await simulate(spec, "single-target", encounter.duration, 1, preset.defaultRules, candidate, armory, profileFingerprint, request.signal);
    const baselineAoe = await simulate(spec, "aoe", encounter.duration, encounter.aoeTargets, preset.defaultRules, baseline, armory, profileFingerprint, request.signal);
    const candidateAoe = candidate === baseline ? baselineAoe : await simulate(spec, "aoe", encounter.duration, encounter.aoeTargets, preset.defaultRules, candidate, armory, profileFingerprint, request.signal);
    const relative = (value: number, origin: number) => origin > 0 ? ((value - origin) / origin) * 100 : 0;
    const statDeltas = {
      primary: candidateSingle.combatStats.primary - baselineSingle.combatStats.primary,
      crit: candidateSingle.combatStats.crit - baselineSingle.combatStats.crit,
      haste: candidateSingle.combatStats.haste - baselineSingle.combatStats.haste,
      mastery: candidateSingle.combatStats.mastery - baselineSingle.combatStats.mastery,
      versatility: candidateSingle.combatStats.versatility - baselineSingle.combatStats.versatility,
    };
    const singleTargetDelta = relative(candidateSingle.dps, baselineSingle.dps);
    const aoeDelta = relative(candidateAoe.dps, baselineAoe.dps);
    const differenceMargin = (baselineResult: CachedSimulation, candidateResult: CachedSimulation, unchanged: boolean) => unchanged ? 0 : 1.96 * Math.hypot(baselineResult.dpsError, candidateResult.dpsError);
    const singleTargetMarginDps = differenceMargin(baselineSingle, candidateSingle, candidate === baseline);
    const aoeMarginDps = differenceMargin(baselineAoe, candidateAoe, candidate === baseline);
    const integrityError = talentSimulationIntegrityError({ editDistance: editDistance!, addedRanks: addedRanks!, removedRanks: removedRanks!, singleTargetDelta, aoeDelta });
    if (integrityError) return secureJson({ error: integrityError }, 422);
    return secureJson({
      singleTargetDelta,
      aoeDelta,
      baselineSingleTargetDps: baselineSingle.dps,
      candidateSingleTargetDps: candidateSingle.dps,
      baselineAoeDps: baselineAoe.dps,
      candidateAoeDps: candidateAoe.dps,
      engine: candidateSingle.engine,
      iterations: Math.min(baselineSingle.iterations, candidateSingle.iterations, baselineAoe.iterations, candidateAoe.iterations),
      modelNotice: candidateSingle.modelNotice,
      source: "simulationcraft",
      uncertainty: {
        confidence: Math.min(baselineSingle.confidence, candidateSingle.confidence, baselineAoe.confidence, candidateAoe.confidence),
        singleTargetDps: Math.ceil(singleTargetMarginDps),
        singleTargetPercent: baselineSingle.dps > 0 ? singleTargetMarginDps / baselineSingle.dps * 100 : 0,
        aoeDps: Math.ceil(aoeMarginDps),
        aoePercent: baselineAoe.dps > 0 ? aoeMarginDps / baselineAoe.dps * 100 : 0,
      },
      statDeltas,
      encounter,
    }, 200, { "X-Gildra-Engine": "simulationcraft" });
  } catch (error) {
    if (error instanceof SimulationWorkerError && error.code === "unsupported_combat_model") {
      return secureJson({ error: "Для лекарей DPS недостаточно: нужен отдельный расчёт HPS и выживаемости группы. Фальшивую цифру показывать не будем." }, 422);
    }
    return secureJson({ error: "SimulationCraft сейчас недоступен. Подождите немного и попробуйте снова." }, 503, { "Retry-After": "2" });
  }
}
