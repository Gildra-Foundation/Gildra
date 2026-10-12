import "server-only";
import type { DungeonRoute } from "./dungeonRoutes";
import { routeRoleDefaultsEn, routeTextEn } from "./routeStopsEn";

/**
 * The route in the page's language. The routes are written in Russian
 * (dungeonRoutes.ts); English pages take the translated text from
 * routeStopsEn.ts, aligned by stop index. Numbers, positions, enemies and
 * abilities stay shared.
 */
export function localizedRoute(route: DungeonRoute, locale: "en" | "ru"): DungeonRoute {
  if (locale === "ru") return route;
  const text = routeTextEn[route.slug];
  return {
    ...route,
    location: text.location,
    description: text.description,
    floors: route.floors.map((floor, index) => ({ ...floor, label: text.floors[index] ?? floor.label })),
    stops: route.stops.map((stop, index) => {
      const en = text.stops[index];
      return en ? {
        ...stop,
        title: en.title,
        subtitle: en.subtitle,
        summary: en.summary,
        callouts: en.callouts,
        tank: en.tank ?? routeRoleDefaultsEn.tank,
        healer: en.healer ?? routeRoleDefaultsEn.healer,
        dps: en.dps ?? routeRoleDefaultsEn.dps,
      } : stop;
    }),
  };
}
