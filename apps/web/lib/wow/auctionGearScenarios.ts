import type { GearSimulationScenario } from "./gearSimulation";

export type AuctionGearEncounter = { scenario: GearSimulationScenario; fightLengthSeconds: number; targets: number };
/** Bounds are resource policy, not a claim that one encounter represents all content. */
export function parseAuctionGearEncounter(value: { scenario?: unknown; fightLengthSeconds?: unknown; targets?: unknown }): AuctionGearEncounter {
  const scenario = value.scenario ?? "single-target";
  if (scenario !== "single-target" && scenario !== "aoe" && scenario !== "execute") throw new Error("invalid_plan_request");
  const fightLengthSeconds = value.fightLengthSeconds ?? (scenario === "aoe" ? 60 : scenario === "execute" ? 90 : 120);
  const targets = value.targets ?? (scenario === "aoe" ? 5 : 1);
  if (!Number.isInteger(fightLengthSeconds) || Number(fightLengthSeconds) < 30 || Number(fightLengthSeconds) > 300 ||
      !Number.isInteger(targets) || Number(targets) < 1 || Number(targets) > 8 || (scenario !== "aoe" && targets !== 1)) throw new Error("invalid_plan_request");
  return { scenario, fightLengthSeconds: Number(fightLengthSeconds), targets: Number(targets) };
}

export function parseAuctionGearCompareScenarios(value: unknown): AuctionGearEncounter[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3 || value.some(e => !e || typeof e !== "object" || Array.isArray(e) || Object.keys(e).some(k => !["scenario", "fightLengthSeconds", "targets"].includes(k)))) throw new Error("invalid_plan_request");
  const parsed = value.map(parseAuctionGearEncounter);
  if (new Set(parsed.map(e => JSON.stringify(e))).size !== parsed.length) throw new Error("invalid_plan_request");
  return parsed;
}

/** Normalize legacy omitted settings before comparing an accepted request with a result. */
export function auctionGearEncounterMatches(expected: { scenario?: unknown; fightLengthSeconds?: unknown; targets?: unknown; compareScenarios?: unknown }, actual: typeof expected) {
  try {
    return JSON.stringify(parseAuctionGearEncounter(expected)) === JSON.stringify(parseAuctionGearEncounter(actual)) &&
      JSON.stringify(parseAuctionGearCompareScenarios(expected.compareScenarios)) === JSON.stringify(parseAuctionGearCompareScenarios(actual.compareScenarios));
  } catch { return false; }
}
