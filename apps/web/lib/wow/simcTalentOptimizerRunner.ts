import "server-only";

import type { RotationSimulationResult } from "../platform/rotation/types";
import type { BattleNetSimulationSnapshot } from "./battleNetCharacterDetails";
import {
  createTalentOptimizerCacheKey,
  type TalentOptimizerSimulation,
  type TalentOptimizerSimulationRequest,
} from "./talentOptimizer";

type CacheEntry = TalentOptimizerSimulation & { expiresAt: number };
const globalCache = globalThis as typeof globalThis & { __gildraTalentOptimizerCache?: Map<string, CacheEntry> };
const cache = globalCache.__gildraTalentOptimizerCache ??= new Map<string, CacheEntry>();

export class SimcTalentOptimizerError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(`SimulationCraft optimizer failed: ${code} (${status})`);
  }
}

const workerURL = () => (process.env.ROTATION_WORKER_URL ?? "http://127.0.0.1:58082").replace(/\/$/, "");

export function createSimcTalentOptimizerRunner(armory?: BattleNetSimulationSnapshot) {
  return async (request: TalentOptimizerSimulationRequest): Promise<TalentOptimizerSimulation> => {
    const key = createTalentOptimizerCacheKey(request);
    const cached = cache.get(key);
    if (!request.bypassCache && cached && cached.expiresAt > Date.now()) return {
      dps: cached.dps, dpsError: cached.dpsError, engine: cached.engine, iterations: cached.iterations,
      confidence: cached.confidence, fromCache: true,
    };

    const response = await fetch(`${workerURL()}/v1/wow/rotation/simulations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        spec: request.spec,
        scenario: request.encounter.simcScenario,
        fightLengthSeconds: request.encounter.duration,
        targets: request.encounter.targets,
        rules: request.apl,
        talentLoadout: request.talentLoadout,
        armory: armory ? { profile: armory.profile, specializations: armory.specializations, equipment: armory.equipment } : undefined,
      }),
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]),
    });
    if (!response.ok || response.headers.get("x-gildra-engine") !== "simulationcraft") {
      const payload = await response.json().catch(() => ({})) as { code?: string };
      throw new SimcTalentOptimizerError(response.status, payload.code ?? "simulation_unavailable");
    }
    const payload = await response.json() as RotationSimulationResult;
    if (!Number.isFinite(payload.dps) || !String(payload.engine).startsWith("SimulationCraft")) {
      throw new SimcTalentOptimizerError(502, "invalid_simulation_result");
    }
    const result: CacheEntry = {
      dps: payload.dps,
      dpsError: Math.max(0, payload.dpsError ?? 0),
      engine: payload.engine,
      iterations: payload.iterations,
      confidence: payload.confidence || 95,
      fromCache: false,
      expiresAt: Date.now() + 10 * 60_000,
    };
    if (!request.bypassCache) {
      cache.set(key, result);
      if (cache.size > 2_000) cache.delete(cache.keys().next().value as string);
    }
    return {
      dps: result.dps, dpsError: result.dpsError, engine: result.engine, iterations: result.iterations,
      confidence: result.confidence, fromCache: false,
    };
  };
}
