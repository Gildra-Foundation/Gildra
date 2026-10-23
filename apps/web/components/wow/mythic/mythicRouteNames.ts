import type { DungeonRoute, DungeonSelectorOption } from "@/lib/data/wow/mythic/dungeonRoutes";
import { fullWowNameTable } from "@/lib/wow/fullWowNameTable";
import { collectStrings, pickWowNameTable } from "@/lib/wow/pickWowNameTable";
import { sourceName } from "@/lib/wow/wowNameTable";
import type { DungeonCombatIntel } from "./dungeonCombatIntel.types";
import * as routeCopy from "./mythicRouteCopy";
import { routeAbilityIntel, routeEnemyIntel } from "./routeIntel";

/**
 * The source names one route page can show (server side). The planner
 * translates its route data, the planner copy it mixes into that prose and the
 * intel generated per step, so all three go into the pick; the review and MDT
 * panels never translate names.
 */
export function mythicRouteNames(locale: routeCopy.RouteLocale, dungeon: DungeonRoute, dungeonOptions: DungeonSelectorOption[], combatIntel: DungeonCombatIntel) {
  const texts = collectStrings([dungeon, dungeonOptions, combatIntel.enemies, combatIntel.abilities, routeCopy]);
  const copy = routeCopy.mythicRouteCopy[locale];
  const dungeonName = sourceName(fullWowNameTable, dungeon.name, locale, dungeon.nameRu);
  for (const stop of dungeon.stops) {
    for (const enemy of stop.enemies) {
      const intel = routeEnemyIntel(enemy, stop, dungeonName, locale);
      texts.add(intel.summary).add(intel.danger).add(copy.enemyFallback(enemy.name));
    }
    for (const ability of stop.abilities) {
      const intel = routeAbilityIntel(ability, stop, locale);
      texts.add(intel.effect).add(intel.failure).add(copy.abilityFallback(ability.name));
    }
  }
  const npc = Object.values(combatIntel.enemies).flatMap(({ media }) => media?.npcId ? [media.npcId] : []);
  const spell = Object.values(combatIntel.abilities).flatMap(({ media }) => media?.media.spellId ? [media.media.spellId] : []);
  return pickWowNameTable(locale, texts, { npc, spell });
}
