import type { GearFarmSettings } from "./types";

export const farmDungeonDifficulties = ["normal", "heroic", "mythic", "mythic-plus"] as const;
export const farmRaidDifficulties = ["raid-finder", "normal", "heroic", "mythic"] as const;

/** Request bounds, not a claim that every accepted key has verified rewards. */
export const farmMythicKeyBounds = { min: 2, max: 99 } as const;

/** Shared by HTTP, recovered-job identity and the trusted-snapshot runner.
 * Omitted settings preserve the original Normal/LFR scope. Coercion, unknown
 * difficulties and keys attached to another mode are rejected, never ignored. */
export function normalizeFarmSettings(input: {
  dungeonDifficulty?: unknown;
  raidDifficulty?: unknown;
  mythicKeyLevel?: unknown;
} = {}): GearFarmSettings {
  const dungeonDifficulty = input.dungeonDifficulty === undefined ? "normal" : input.dungeonDifficulty;
  const raidDifficulty = input.raidDifficulty === undefined ? "raid-finder" : input.raidDifficulty;
  if (!farmDungeonDifficulties.some(value => value === dungeonDifficulty) ||
    !farmRaidDifficulties.some(value => value === raidDifficulty)) throw new Error("invalid_farm_settings");
  if (dungeonDifficulty === "mythic-plus") {
    if (!Number.isSafeInteger(input.mythicKeyLevel) || Number(input.mythicKeyLevel) < farmMythicKeyBounds.min ||
      Number(input.mythicKeyLevel) > farmMythicKeyBounds.max) throw new Error("invalid_farm_settings");
  } else if (input.mythicKeyLevel !== undefined) throw new Error("invalid_farm_settings");
  return {
    dungeonDifficulty: dungeonDifficulty as GearFarmSettings["dungeonDifficulty"],
    raidDifficulty: raidDifficulty as GearFarmSettings["raidDifficulty"],
    ...(dungeonDifficulty === "mythic-plus" ? { mythicKeyLevel: Number(input.mythicKeyLevel) } : {}),
  };
}
