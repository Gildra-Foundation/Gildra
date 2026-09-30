import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { simulateRotation } from "@/lib/platform/rotation/simulation";
import { getRotationPreset } from "@/lib/platform/rotation/repository";
import type { RotationScenario, RotationSimulationInput } from "@/lib/platform/rotation/types";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { getBattleNetSimulationSnapshot, type BattleNetSimulationSnapshot } from "@/lib/wow/battleNetCharacterDetails";
import { getBattleNetCharacterBySlug } from "@/lib/wow/battleNetCharacters";
import { attachBattleNetArmory } from "@/lib/platform/rotation/battleNetEngineInput";
import { validateAplRules } from "@/lib/platform/rotation/apl";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;
const RESULT_CACHE_MS = 30_000;
const configuredRateLimit = Number(process.env.ROTATION_RATE_LIMIT_PER_MINUTE ?? 40);
const RATE_LIMIT_PER_MINUTE = Number.isFinite(configuredRateLimit) ? Math.min(60, Math.max(20, configuredRateLimit)) : 40;
const apiURL = () => (process.env.API_INTERNAL_URL ?? "http://api:8080").replace(/\/$/, "");
const workerURL = () => process.env.ROTATION_WORKER_URL?.replace(/\/$/, "");
const scenarios = new Set<RotationScenario>(["single-target", "aoe", "execute"]);
const abilityId = /^[a-z0-9][a-z0-9-]{1,63}$/;

type EngineReply = {
  body: string;
  status: number;
  engine: string;
  retryAfter?: string;
};

const inFlight = new Map<string, Promise<EngineReply>>();
const recent = new Map<string, { expiresAt: number; reply: EngineReply }>();
const rateWindows = new Map<string, { resetAt: number; count: number }>();
const armoryCache = new Map<string, { expiresAt: number; snapshot: BattleNetSimulationSnapshot }>();

type RotationEngineInput = Omit<RotationSimulationInput, "characterSlug" | "dataMode" | "verificationRun"> & {
  armory?: { profile: Record<string, unknown>; specializations: Record<string, unknown>; equipment: Record<string, unknown> };
};

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const expectedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return Boolean(expectedHost) && new URL(origin).host === expectedHost;
  } catch { return false; }
}

async function resolveArmory(accessToken: string, requestedSlug: string) {
  const normalized = decodeURIComponent(requestedSlug).toLowerCase();
  const key = createHash("sha256").update(`${accessToken}:${normalized}`).digest("hex");
  const cached = armoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.snapshot;
  const character = await getBattleNetCharacterBySlug(accessToken, "ru", requestedSlug);
  if (!character) return null;
  const snapshot = await getBattleNetSimulationSnapshot(accessToken, character);
  armoryCache.set(key, { expiresAt: Date.now() + 60_000, snapshot });
  if (armoryCache.size > 100) armoryCache.delete(armoryCache.keys().next().value as string);
  return snapshot;
}

function withinRateLimit(request: Request) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const window = rateWindows.get(client);
  if (!window || window.resetAt <= now) {
    rateWindows.set(client, { resetAt: now + 60_000, count: 1 });
    return true;
  }
  window.count += 1;
  return window.count <= RATE_LIMIT_PER_MINUTE;
}

function validInput(value: unknown): value is RotationSimulationInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<RotationSimulationInput>;
  if ((value as Record<string, unknown>).armory !== undefined) return false;
  return typeof input.spec === "string"
    && Boolean(getTalentSpecTheme(input.spec))
    && scenarios.has(input.scenario as RotationScenario)
    && Number.isInteger(input.fightLengthSeconds)
    && Number(input.fightLengthSeconds) >= 30
    && Number(input.fightLengthSeconds) <= 300
    && Number.isInteger(input.targets)
    && Number(input.targets) >= 1
    && Number(input.targets) <= 8
    && Array.isArray(input.rules)
    && input.rules.length > 0
    && input.rules.length <= 10
    && new Set(input.rules).size === input.rules.length
    && input.rules.every((rule) => typeof rule === "string" && abilityId.test(rule))
    && (input.aplRules === undefined || (Array.isArray(input.aplRules) && input.aplRules.length > 0 && input.aplRules.length <= 10))
    && (input.characterSlug === undefined || (typeof input.characterSlug === "string" && input.characterSlug.length >= 3 && input.characterSlug.length <= 240))
    && (input.dataMode === undefined || input.dataMode === "fixture" || input.dataMode === "battle-net")
    && (input.skipBaseline === undefined || typeof input.skipBaseline === "boolean")
    && (input.verificationRun === undefined || typeof input.verificationRun === "boolean")
    && !(input.skipBaseline === true && input.verificationRun === true)
    && (input.talentLoadout === undefined || (typeof input.talentLoadout === "string"
      && input.talentLoadout.length >= 20
      && input.talentLoadout.length <= 512
      && /^[A-Za-z0-9+/=_-]+$/.test(input.talentLoadout)));
}

function responseFrom(reply: EngineReply, verifiedFresh = false) {
  return new NextResponse(reply.body, {
    status: reply.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      "X-Gildra-Engine": reply.engine,
      ...(verifiedFresh ? { "X-Gildra-Verification": "fresh" } : {}),
      ...(reply.retryAfter ? { "Retry-After": reply.retryAfter } : {}),
    },
  });
}

async function callEngine(baseURL: string, timeout: number, fallbackEngine: string, input: RotationEngineInput): Promise<EngineReply> {
  try {
    const response = await fetch(`${baseURL}/v1/wow/rotation/simulations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
    });
    return {
      body: await response.text(),
      status: response.status,
      engine: response.headers.get("x-gildra-engine") ?? fallbackEngine,
      retryAfter: response.headers.get("retry-after") ?? undefined,
    };
  } catch {
    return {
      body: JSON.stringify({ error: "Simulation engine is temporarily unavailable." }),
      status: 503,
      engine: fallbackEngine,
      retryAfter: "2",
    };
  }
}

async function simulate(input: RotationEngineInput, baselineRules: string[], allowTrainingFallback: boolean): Promise<EngineReply> {
  const worker = workerURL();
  if (worker) {
    const workerReply = await callEngine(worker, 48_000, "simulationcraft", input);
    if (workerReply.status >= 200 && workerReply.status < 300) return workerReply;

    // Keep the training workflow usable while the external engine is down. The
    // deterministic result identifies itself as an MVP model in its payload.
    const fallbackAllowed = allowTrainingFallback && process.env.ROTATION_ALLOW_MVP_FALLBACK !== "false";
    const infrastructureFailure = workerReply.status === 429 || workerReply.status >= 500;
    if (!fallbackAllowed || !infrastructureFailure) return workerReply;
    return {
      body: JSON.stringify(simulateRotation(input, baselineRules)),
      status: 201,
      engine: "mvp-fallback",
    };
  }

  const apiReply = await callEngine(apiURL(), 5_000, "api", input);
  if (apiReply.status >= 200 && apiReply.status < 300) return apiReply;

  const allowMvpFallback = allowTrainingFallback && process.env.ROTATION_ALLOW_MVP_FALLBACK !== "false";
  if (!allowMvpFallback) return apiReply;
  return {
    body: JSON.stringify(simulateRotation(input, baselineRules)),
    status: 201,
    engine: "mvp-fallback",
  };
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Simulation request is too large." }, { status: 413 });
  }

  let input: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Simulation request is too large." }, { status: 413 });
    }
    input = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed simulation request." }, { status: 400 });
  }
  if (!validInput(input)) {
    return NextResponse.json({ error: "Choose a supported specialization, scenario, and priority list." }, { status: 400 });
  }

  const preset = await getRotationPreset(input.spec, "en");
  const allowedAbilities = new Set(preset.abilities.map((ability) => ability.id));
  if (!input.rules.every((rule) => allowedAbilities.has(rule))) {
    return NextResponse.json({ error: "The priority list contains an ability outside this specialization." }, { status: 400 });
  }
  if (input.aplRules) {
    const validation = validateAplRules(input.aplRules, [...allowedAbilities], preset.aplOptions);
    const samePriority = input.aplRules.length === input.rules.length
      && input.aplRules.every((rule, index) => rule.abilityId === input.rules[index]);
    if (!validation.valid || !samePriority) {
      return NextResponse.json({ error: "The conditional priority contains an invalid or unsupported condition.", details: validation.errors }, { status: 400 });
    }
  }

  const { characterSlug: requestedCharacterSlug, dataMode, verificationRun = false, ...publicInput } = input;
  let engineInput: RotationEngineInput = publicInput;
  let profileFingerprint = "reference";
  if (requestedCharacterSlug && dataMode !== "fixture") {
    const session = await auth();
    if (!session?.battleNetAccessToken) return NextResponse.json({ error: "Battle.net session expired. Sign in again." }, { status: 401 });
    let armory: BattleNetSimulationSnapshot | null;
    try {
      armory = await resolveArmory(session.battleNetAccessToken, requestedCharacterSlug);
    } catch {
      return NextResponse.json({ error: "Battle.net character data is temporarily unavailable." }, { status: 503, headers: { "Retry-After": "2" } });
    }
    if (!armory) return NextResponse.json({ error: "Character was not found in the connected Battle.net account." }, { status: 404 });
    const theme = getTalentSpecTheme(input.spec);
    if (!theme || armory.activeSpecializationId !== theme.specId) return NextResponse.json({ error: "The character's active specialization does not match this rotation." }, { status: 409 });
    engineInput = attachBattleNetArmory(publicInput, armory);
    profileFingerprint = createHash("sha256").update(JSON.stringify(engineInput.armory)).digest("hex");
  }

  const { armory: _armory, ...cacheInput } = engineInput;
  const key = `${profileFingerprint}:${JSON.stringify(cacheInput)}`;
  const cached = recent.get(key);
  if (!verificationRun && cached && cached.expiresAt > Date.now()) return responseFrom(cached.reply);
  if (cached && cached.expiresAt <= Date.now()) recent.delete(key);

  if (!withinRateLimit(request)) {
    return NextResponse.json({ error: "Too many simulation requests. Try again in a minute." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const allowTrainingFallback = !requestedCharacterSlug || dataMode === "fixture";
  let job = verificationRun ? simulate(engineInput, preset.defaultRules, allowTrainingFallback) : inFlight.get(key);
  if (!job) {
    job = simulate(engineInput, preset.defaultRules, allowTrainingFallback).finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  const reply = await job;
  if (!verificationRun && reply.status >= 200 && reply.status < 300) {
    recent.set(key, { expiresAt: Date.now() + RESULT_CACHE_MS, reply });
    if (recent.size > 100) recent.delete(recent.keys().next().value as string);
  }
  return responseFrom(reply, verificationRun);
}
