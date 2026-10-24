import { mvpRouteCopy } from "./mvpRouteCopy";
import type { DungeonRoute } from "./dungeonRoutes";
import type { RouteStop } from "./rubyLifePoolsData";
import { localizedRoute } from "./localizedRoute";
import routes from "./mvpRoutes.json";
import tactics from "./mvpTrashTactics.json";
import type { RouteAbility } from "./rubyLifePoolsData";

/** Author route references resolved against the current MDT NPC/clone map. */
export function mvpRoute(route: DungeonRoute, locale: "ru" | "en"): DungeonRoute {
  const copy = mvpRouteCopy[locale];
  const localized = localizedRoute(route, locale);
  const evidence = routes[route.slug];
  let cumulative = 0;
  const stops: RouteStop[] = evidence.pulls.map((pull, index) => {
    cumulative += pull.forces;
    const boss = localized.stops.find(stop => stop.kind === "boss" && stop.enemies.some(enemy => pull.enemies.some(member => member.boss && member.name === enemy.name)));
    const relevant = tactics.filter(tactic => pull.enemies.some(enemy => enemy.name === tactic.enemy));
    const assignments: Record<string, string> = { ArcanistVexis: "tank", MysticHeals: "healer", ShadowNova: "dps", Windborne: "dps", Ironclad: "dps" };
    const abilities: RouteAbility[] = boss?.abilities.map(ability => ({ ...ability, target: assignments[ability.target] ?? ability.target })) ?? relevant.map(tactic => ({ name: tactic.spell, action: tactic.action as RouteAbility["action"], source: tactic.enemy, target: tactic.role }));
    const uniqueAbilities = [...new Map(abilities.map(ability => [`${ability.source}:${ability.name}:${ability.action}`, ability])).values()];
    const roleText = (role: string) => relevant.filter(tactic => tactic.role === role).map(tactic => `${tactic.enemy}: ${tactic[locale]}`).join(" ");
    return {
      id: index + 1, x: pull.x, y: pull.y, floor: 1, duration: 0,
      forces: pull.forces / evidence.requiredForces * 100, cumulative: cumulative / evidence.requiredForces * 100,
      kind: boss ? "boss" : "pull",
      title: boss?.title ?? `${copy.pull} ${index + 1}`,
      subtitle: boss?.subtitle ?? pull.enemies.map(enemy => `${enemy.count} × ${enemy.name}`).join(" · "),
      summary: boss?.summary ?? (copy.summary),
      callouts: boss?.callouts ?? [],
      tank: boss?.tank ?? (roleText("tank") || (copy.tank)),
      healer: boss?.healer ?? (roleText("healer") || (copy.healer)),
      dps: boss?.dps ?? (roleText("dps") || (copy.dps)),
      abilities: uniqueAbilities,
      enemies: pull.enemies.map(enemy => ({ name: enemy.name, count: enemy.count, priority: enemy.boss ? "boss" : "medium" })),
    };
  });
  return {
    ...localized, stops, mapImage: `/assets/wow/maps/mvp/${route.slug}.webp`,
    floors: [{ id: 1, label: copy.fullMap }],
    routeEvidence: { source: evidence.source, sourceVersion: evidence.sourceVersion, mapSource: evidence.mapSource, verifiedAt: evidence.verifiedAt, requiredForces: evidence.requiredForces, totalForces: evidence.totalForces, adjusted: evidence.changes.length > 0 },
  };
}
