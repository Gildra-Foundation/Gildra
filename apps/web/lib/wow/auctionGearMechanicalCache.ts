import { createHash } from "node:crypto";
import type { GearPlanSimulation } from "./auctionGearTypes";

const ttlMs = 15 * 60_000;
const maximum = 4096;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonical(entry)]));
}

/** No credentials, localized presentation, prices or character names are retained. */
export function auctionGearMechanicalKey(profileFingerprint: string, request: {
  spec: string; scenario: string; fightLengthSeconds: number; targets: number; gearChanges?: unknown[];
}) {
  const changes = (request.gearChanges ?? []).map(canonical).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return createHash("sha256").update(JSON.stringify(canonical({ profileFingerprint, ...request, gearChanges: changes,
    actionListMode: "native", version: 1 }))).digest("hex");
}

export function createAuctionGearMechanicalCache(now = Date.now, capacity = maximum, lifetime = ttlMs) {
  const entries = new Map<string, { expiresAt: number; simulation: GearPlanSimulation }>();
  return {
    get(key: string, verifiedEngine: string) {
      if (!verifiedEngine.startsWith("SimulationCraft")) return undefined;
      const id = `${verifiedEngine}:${key}`, entry = entries.get(id);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) { entries.delete(id); return undefined; }
      entries.delete(id); entries.set(id, entry);
      return { ...entry.simulation };
    },
    set(key: string, simulation: GearPlanSimulation) {
      if (typeof simulation.engine !== "string" || !simulation.engine.startsWith("SimulationCraft") || !Number.isFinite(simulation.dps) || simulation.dps < 0 ||
          !Number.isFinite(simulation.dpsError) || simulation.dpsError < 0 || simulation.confidence !== 95 ||
          !Number.isSafeInteger(simulation.iterations) || simulation.iterations <= 0) return;
      const id = `${simulation.engine}:${key}`;
      entries.delete(id); entries.set(id, { expiresAt: now() + lifetime, simulation: { ...simulation } });
      while (entries.size > capacity) entries.delete(entries.keys().next().value!);
    },
    clear() { entries.clear(); },
  };
}
export const auctionGearMechanicalCache = createAuctionGearMechanicalCache();
