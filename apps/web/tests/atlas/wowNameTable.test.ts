import assert from "node:assert/strict";
import { test } from "node:test";
import { getDungeonRoute, getDungeonSelectorOptions } from "../../lib/data/wow/mythic/dungeonRoutes.ts";
import { fullWowNameTable } from "../../lib/wow/fullWowNameTable.ts";
import { npcName, routeText, sourceName, spellName, type WowNameTable } from "../../lib/wow/wowNameTable.ts";
import { getDungeonCombatIntel } from "../../components/wow/mythic/dungeonCombatIntel.server.ts";
import { localizedRoute } from "../../components/wow/mythic/localizedRoute.ts";
import { mythicRouteCopy, plainLanguage, stopSubtitle, type RouteLocale } from "../../components/wow/mythic/mythicRouteCopy.ts";
import { mythicRouteNames } from "../../components/wow/mythic/mythicRouteNames.ts";
import { routeAbilityIntel, routeEnemyIntel } from "../../components/wow/mythic/routeIntel.ts";

/** Every name lookup the route planner makes, as MythicRouteMapClient and CombatIntelCard make them. */
function plannerText(names: WowNameTable, locale: RouteLocale, slug: string) {
  const raw = getDungeonRoute(slug)!;
  const dungeon = locale === "en" ? localizedRoute(raw, "en") : raw;
  const combatIntel = getDungeonCombatIntel(raw);
  const copy = mythicRouteCopy[locale];
  const route = (value: string) => routeText(names, value, locale);
  const dungeonName = sourceName(names, dungeon.name, locale, dungeon.nameRu);
  const out = [dungeonName, ...getDungeonSelectorOptions().map((option) => sourceName(names, option.name, locale, option.nameRu))];
  for (const stop of dungeon.stops) {
    const encounter = route(stop.title);
    out.push(encounter, route(encounter), route(`${stop.title} · A`), route(`${stop.title} · A · B`), stopSubtitle(stop.subtitle, locale, names, stop.enemies),
      ...[stop.summary, stop.tank, stop.healer, stop.dps, ...stop.callouts].map((value) => plainLanguage(value, locale, names)));
    for (const enemy of stop.enemies) {
      const data = combatIntel.enemies[enemy.name];
      const intel = routeEnemyIntel(enemy, stop, dungeonName, locale);
      out.push(npcName(names, enemy.name, locale, data?.media?.npcId), ...[intel.summary, intel.danger, data?.intel?.summary ?? "", data?.intel?.danger ?? "",
        copy.enemyFallback(enemy.name), copy.enemyDanger, copy.enemyDangerBoss].map(route));
    }
    for (const ability of stop.abilities) {
      const data = combatIntel.abilities[ability.name];
      const intel = routeAbilityIntel(ability, stop, locale);
      out.push(spellName(names, ability.name, locale, data?.media?.media.spellId), ...[intel.effect, intel.failure, data?.intel?.effect ?? "", data?.intel?.failure ?? "",
        ability.source ?? data?.source ?? copy.dangerousEnemy, copy.abilityFallback(ability.name), copy.abilityFailInterrupt, copy.abilityFailDispel, copy.abilityFailOther].map(route));
    }
  }
  return out;
}

test("route pages read the same with their name slice as with the full dictionaries", () => {
  for (const { slug } of getDungeonSelectorOptions()) for (const locale of ["ru", "en"] as const) {
    const raw = getDungeonRoute(slug)!;
    const dungeon = locale === "en" ? localizedRoute(raw, "en") : raw;
    const names = mythicRouteNames(locale, dungeon, getDungeonSelectorOptions(), getDungeonCombatIntel(raw));
    assert.deepEqual(plannerText(names, locale, slug), plannerText(fullWowNameTable, locale, slug), `${locale} ${slug}`);
    assert.ok(Object.keys(names.route).length < Object.keys(fullWowNameTable.route).length / 2, `${locale} ${slug} ships a slice, not the dictionary`);
  }
});

test("English route pages carry only NPC and spell names", () => {
  const raw = getDungeonRoute("murder-row")!;
  const names = mythicRouteNames("en", localizedRoute(raw, "en"), getDungeonSelectorOptions(), getDungeonCombatIntel(raw));
  assert.deepEqual([Object.keys(names.source).length, Object.keys(names.route).length], [0, 0]);
});
