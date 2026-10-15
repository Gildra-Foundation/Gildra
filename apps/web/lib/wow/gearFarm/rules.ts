import type { FarmAccess, FarmActivity } from "./types";
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
