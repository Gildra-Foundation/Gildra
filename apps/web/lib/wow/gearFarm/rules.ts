import type { FarmAccess, FarmActivity, GearFarmSettings } from "./types";
import { normalizeFarmSettings } from "./settings";
const launch = "https://news.blizzard.com/en-us/article/24264417/world-of-warcraft-midnighttm-now-live";
const raid = "https://news.blizzard.com/en-us/article/24294062/curse-of-ulatek-the-venomous-abyss-raid-finder-wing-3-now-live";
const lair = "https://news.blizzard.com/en-us/article/24295085/step-into-lairs-and-face-the-foes-inside";
export type FarmRule = Omit<FarmActivity, "access" | "targets" | "lootItemsChecked" | "variantsUnverified">;
// Alternative unlocks are quests OR a warband level; they are not minimum
// entry levels. We only prove the level alternative from this character.
export const farmRules: FarmRule[] = [["windrunner-spire", "Windrunner Spire", 81], ["murder-row", "Murder Row", 83], ["maisara-caverns", "Maisara Caverns", 85], ["the-blinding-vale", "The Blinding Vale", 88], ["den-of-nalorakk", "Den of Nalorakk", 88], ["magisters-terrace", "Magisters' Terrace", 90], ["nexus-point-xenas", "Nexus-Point Xenas", 90], ["voidscar-arena", "Voidscar Arena", 90]].map(([slug, name, unlockLevel]) => ({
  id: `${slug}:normal`,
  slug: String(slug),
  name: String(name),
  difficulty: "normal" as const,
  difficultyId: 1,
  unlockLevel: Number(unlockLevel),
  group: "dungeon" as const,
  sourceUrl: launch,
  sourceVerifiedAt: "2026-10-15"
}));
export const endgameFarmRules: FarmRule[] = [{
  id: "venomous-abyss:raid-finder",
  slug: "venomous-abyss",
  name: "The Venomous Abyss",
  difficulty: "raid-finder",
  difficultyId: 17,
  minLevel: 90,
  minItemLevel: 273,
  group: "raid",
  sourceUrl: raid,
  sourceVerifiedAt: "2026-10-15"
}, {
  id: "tidebound-grotto:world",
  slug: "tidebound-grotto",
  name: "Tidebound Grotto",
  difficulty: "world",
  minLevel: 90,
  recommendedItemLevel: 273,
  group: "raid",
  sourceUrl: lair,
  sourceVerifiedAt: "2026-10-15"
}];
export function farmAccess(rule: FarmRule, level: number, equippedItemLevel: number): FarmAccess {
  if (rule.minLevel && level < rule.minLevel) return "level_locked";
  if (rule.minItemLevel && equippedItemLevel < rule.minItemLevel) return "gear_locked";
  if (rule.unlockLevel && level < rule.unlockLevel) return "unlock_unverified";
  return "level_condition_met";
}
// A finite mask needs the build-specific difficulty/order mapping. Until that
// is available, only an explicit all-difficulties row proves Normal loot.
export function normalLootMask(mask: unknown) {
  return mask === -1;
}

/** A journal row with -1 explicitly applies to every selected difficulty.
 * Finite masks need verified journal-bit semantics as well as Difficulty rows;
 * they remain unknown rather than being classified as a different mode. */
export function farmLootDifficultyMembership(mask: unknown, selectedDifficultyId: number | undefined): "included" | "excluded" | "unknown" {
  if (!Number.isSafeInteger(selectedDifficultyId) || Number(selectedDifficultyId) <= 0) return "unknown";
  return mask === -1 ? "included" : "unknown";
}

// Blizzard's Season 2 roster, cross-checked against the retained same-build
// JournalInstance / MapChallengeMode projection. A roster is source evidence;
// it does not prove an obtainable bonus-list rank at a selected key level.
export const seasonFarmSource = "https://news.blizzard.com/en-us/article/24294369/midnight-season-2-is-now-live";
const mythicSeasonDungeons = [["altar-of-fangs", "Altar of Fangs"], ["murder-row", "Murder Row"],
  ["den-of-nalorakk", "Den of Nalorakk"], ["the-blinding-vale", "The Blinding Vale"],
  ["voidscar-arena", "Voidscar Arena"], ["kings-rest", "Kings' Rest"],
  ["ruby-life-pools", "Ruby Life Pools"], ["temple-of-sethraliss", "Temple of Sethraliss"]] as const;

/** Scope selection never falls back to Normal for an unsupported difficulty. */
export function requestedFarmRules(input: Partial<GearFarmSettings> = {}): FarmRule[] {
  const settings = normalizeFarmSettings(input);
  const dungeonRules: FarmRule[] = settings.dungeonDifficulty === "mythic-plus"
    ? mythicSeasonDungeons.map(([slug, name]) => ({
      id: `${slug}:mythic-plus:${settings.mythicKeyLevel}`, slug, name, group: "dungeon",
      difficulty: "mythic-plus", difficultyId: 8, mythicKeyLevel: settings.mythicKeyLevel, minLevel: 90,
      sourceUrl: seasonFarmSource, sourceVerifiedAt: "2026-11-16",
    }))
    : farmRules.map(rule => settings.dungeonDifficulty === "normal" ? { ...rule } : ({
      ...rule, id: `${rule.slug}:${settings.dungeonDifficulty}`, difficulty: settings.dungeonDifficulty,
      // These modes are available, but their current map/reward projection is
      // absent. No difficulty ID or Normal unlock threshold is substituted.
      difficultyId: undefined, unlockLevel: undefined, minLevel: 90,
      sourceUrl: seasonFarmSource, sourceVerifiedAt: "2026-11-16", unsupportedReason: "difficulty_unverified",
    }));
  const raidRule = endgameFarmRules.find(rule => rule.difficulty === "raid-finder")!;
  const selectedRaid: FarmRule = settings.raidDifficulty === "raid-finder" ? { ...raidRule } : {
    ...raidRule, id: `${raidRule.slug}:${settings.raidDifficulty}`, difficulty: settings.raidDifficulty,
    difficultyId: ({ normal: 14, heroic: 15, mythic: 16 })[settings.raidDifficulty],
    // The LFR queue gate does not apply to a manually formed raid.
    minItemLevel: undefined, sourceUrl: seasonFarmSource, sourceVerifiedAt: "2026-11-16",
  };
  return [...dungeonRules, selectedRaid, ...endgameFarmRules.filter(rule => rule.difficulty === "world").map(rule => ({ ...rule }))];
}
