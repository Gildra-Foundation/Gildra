import type { Lang } from "@/lib/i18n-paths";
import { dungeonGuides } from "./dungeonGuides";
import { hallEncounters } from "./hallOfThanes";
import { newDungeons, returningDungeonDetails, type ForeverDungeon } from "./instanceData";
import { instanceName } from "./instanceLocalization";

/** What a dungeon card and a page heading show: names, place, level band, bosses, whether it is new in Forever. */
export type DungeonCardFacts = { slug: string; name: string; alias?: string; location: string; search: string[]; min: number; max: number; bosses: number; fresh: boolean };

export function dungeonFacts(dungeon: ForeverDungeon, lang: Lang): DungeonCardFacts {
  const guide = dungeonGuides[dungeon.slug];
  const name = instanceName(dungeon.name, lang);
  // Returning dungeons keep their place in the guide's entrance line ("Westfall · Moonbrook").
  const location = dungeon.location ? instanceName(dungeon.location, lang) : guide?.entrance[lang] ?? "";
  return {
    slug: dungeon.slug, name, alias: name !== dungeon.name ? dungeon.name : undefined, location,
    search: [dungeon.name, name, location, dungeon.location || guide?.entrance.en || ""],
    min: dungeon.min, max: dungeon.max,
    bosses: dungeon.slug === "hall-of-thanes" ? hallEncounters.length : guide?.bosses.length ?? 0,
    fresh: newDungeons.some(item => item.slug === dungeon.slug),
  };
}

/** Every Forever dungeon by level band, as the catalogue lists them. */
export const allDungeons: readonly ForeverDungeon[] = [...newDungeons, ...returningDungeonDetails].sort((a, b) => a.min - b.min || a.max - b.max || a.name.localeCompare(b.name));
