import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRotationPreset } from "@/lib/platform/rotation/repository";
import type { RotationSimulationResult } from "@/lib/platform/rotation/types";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { getBattleNetCharacterDetails, getBattleNetSimulationSnapshot } from "@/lib/wow/battleNetCharacterDetails";
import { getBattleNetCharacterBySlug } from "@/lib/wow/battleNetCharacters";
import { getGearCandidatesForEquippedItem } from "@/lib/wow/gearCandidateRepository";
import { compareGearSimulationResults, gearComparisonFingerprint, prepareGearChange, type GearSimulationScenario, type SimcGearChange } from "@/lib/wow/gearSimulation";

export const dynamic = "force-dynamic";

type Body = {
  characterSlug?: string;
  slotType?: string;
  candidateItemId?: number;
  candidateEntityId?: string;
  variantKey?: string;
  scenario?: GearSimulationScenario;
  enchantId?: number;
  gemIds?: number[];
};

type CombatStats = { primary: number; crit: number; haste: number; mastery: number; versatility: number };
type SimResult = { dps: number; dpsError: number; confidence: number; iterations: number; engine: string; combatStats?: CombatStats };
const cache = new Map<string, { expires: number; value: SimResult }>();
const workerURL = () => (process.env.ROTATION_WORKER_URL ?? "http://127.0.0.1:58082").replace(/\/$/, "");

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...headers } });
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

async function simulate(input: {
  key: string; spec: string; scenario: GearSimulationScenario; duration: number; targets: number;
  rules: string[]; talentLoadout: string; armory: { profile: Record<string, unknown>; specializations: Record<string, unknown>; equipment: Record<string, unknown> };
  gearChange?: SimcGearChange; signal: AbortSignal;
}) {
  const cached = cache.get(input.key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const response = await fetch(`${workerURL()}/v1/wow/rotation/simulations`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, cache: "no-store",
    body: JSON.stringify({
      spec: input.spec, scenario: input.scenario, fightLengthSeconds: input.duration, targets: input.targets,
      rules: input.rules, talentLoadout: input.talentLoadout, armory: input.armory, gearChange: input.gearChange,
    }),
    signal: AbortSignal.any([input.signal, AbortSignal.timeout(50_000)]),
  });
  if (!response.ok || response.headers.get("x-gildra-engine") !== "simulationcraft") throw new Error("simulation_unavailable");
  const payload = await response.json() as RotationSimulationResult & { combatStats?: CombatStats };
  if (!Number.isFinite(payload.dps) || !String(payload.engine).startsWith("SimulationCraft")) throw new Error("invalid_simulation_result");
  const value = { dps: payload.dps, dpsError: Math.max(0, payload.dpsError ?? 0), confidence: payload.confidence || 95, iterations: payload.iterations, engine: payload.engine, combatStats: payload.combatStats };
  cache.set(input.key, { expires: Date.now() + 10 * 60_000, value });
  if (cache.size > 300) cache.delete(cache.keys().next().value as string);
  return value;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "cross_site_blocked" }, 403);
  const session = await auth();
  if (!session?.battleNetAccessToken) return reply({ error: "session_expired" }, 401);
  if (Number(request.headers.get("content-length") ?? 0) > 4_096) return reply({ error: "request_too_large" }, 413);
  const body = await request.json().catch(() => null) as Body | null;
  const requested = body?.characterSlug ?? "";
  const slotType = body?.slotType?.toUpperCase() ?? "";
  const scenario = body?.scenario ?? "single-target";
  if (!requested || !body?.candidateEntityId || !Number.isInteger(body.candidateItemId) || !body.variantKey || !["single-target", "aoe", "execute"].includes(scenario)) {
    return reply({ error: "invalid_gear_simulation_request" }, 400);
  }
  try {
    const character = await getBattleNetCharacterBySlug(session.battleNetAccessToken, "ru", requested);
    if (!character) return reply({ error: "character_not_found" }, 404);
    const [details, armory] = await Promise.all([
      getBattleNetCharacterDetails(session.battleNetAccessToken, character, "ru"),
      getBattleNetSimulationSnapshot(session.battleNetAccessToken, character),
    ]);
    const equipped = details.equipment.find((item) => item.slotType === slotType);
    if (!equipped) return reply({ error: "equipped_slot_missing" }, 404);
    const active = details.activeSpec?.toLocaleLowerCase("en-US") ?? "";
    const theme = talentSpecThemes.find((entry) => entry.classId === character.playableClass.id
      && [entry.specName.toLowerCase(), entry.specNameRu.toLocaleLowerCase("ru-RU")].includes(active));
    if (!theme || theme.specId !== armory.activeSpecializationId) return reply({ error: "specialization_unresolved" }, 422);
    const pool = await getGearCandidatesForEquippedItem({
      itemId: equipped.id, itemName: equipped.name, itemLevel: equipped.itemLevel, slotType,
      classId: character.playableClass.id, specId: theme.specId, characterLevel: character.level,
    });
    const candidate = pool.candidates.find((entry) => entry.entityId === body.candidateEntityId && entry.itemId === body.candidateItemId);
    if (!candidate) return reply({ error: "candidate_not_in_verified_pool" }, 422);
    const change = prepareGearChange({
      slotType, candidate, variantKey: body.variantKey,
      customization: { enchantId: body.enchantId, gemIds: body.gemIds }, equipment: armory.equipment,
    });
    const preset = await getRotationPreset(theme.slug, "ru");
    if (!preset.defaultRules.length) throw new Error("rotation_unavailable");
    const encounter = scenario === "aoe" ? { duration: 60, targets: 5 } : scenario === "execute" ? { duration: 90, targets: 1 } : { duration: 120, targets: 1 };
    const profileFingerprint = createHash("sha256").update(JSON.stringify(armory)).digest("hex");
    const common = { profileFingerprint, talentLoadout: armory.activeTalentLoadout, scenario, duration: encounter.duration, targets: encounter.targets, rules: preset.defaultRules };
    const baselineKey = gearComparisonFingerprint(common);
    const candidateKey = gearComparisonFingerprint({ ...common, change });
    const workerInput = { spec: theme.slug, scenario, ...encounter, rules: preset.defaultRules, talentLoadout: armory.activeTalentLoadout, armory, signal: request.signal };
    // The worker intentionally serializes jobs. Sequential execution also makes
    // it impossible for one side of the comparison to observe another snapshot.
    const baseline = await simulate({ ...workerInput, key: baselineKey });
    const simulated = await simulate({ ...workerInput, key: candidateKey, gearChange: change });
    const comparison = compareGearSimulationResults(baseline, simulated);
    return reply({
      scenario: { id: scenario, fightLengthSeconds: encounter.duration, targets: encounter.targets },
      current: { itemId: equipped.id, name: equipped.name, itemLevel: equipped.itemLevel },
      candidate: { itemId: candidate.itemId, entityId: candidate.entityId, name: candidate.name, itemLevel: candidate.variants.find((entry) => entry.key === body.variantKey)?.itemLevel, variantKey: body.variantKey, source: candidate.source, constraints: candidate.constraints },
      change, ...comparison, engine: simulated.engine, iterations: Math.min(baseline.iterations, simulated.iterations),
      stats: { baseline: baseline.combatStats, candidate: simulated.combatStats },
      provenance: { armoryFingerprint: profileFingerprint, baselineFingerprint: baselineKey, candidateFingerprint: candidateKey, catalogBuild: candidate.provenance.build ?? candidate.provenance.buildNumber, source: "simulationcraft" },
    }, 200, { "X-Gildra-Engine": "simulationcraft" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "gear_simulation_unavailable";
    const validationCodes = new Set(["candidate_slot_mismatch", "simulation_variant_not_found", "candidate_matches_equipped_item", "unique_equipped_conflict", "two_hand_requires_offhand_removal", "invalid_enchant_for_slot", "invalid_gems_for_slot"]);
    return validationCodes.has(code) ? reply({ error: code }, 422) : reply({ error: "gear_simulation_unavailable" }, 503, { "Retry-After": "2" });
  }
}
