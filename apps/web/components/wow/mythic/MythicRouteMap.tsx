import type { ComponentProps } from "react";
import { MythicRouteMapClient } from "./MythicRouteMapClient";
import { mythicRouteNames } from "./mythicRouteNames";

/** The route planner with only the source names this page can show, so the dictionaries stay on the server. */
export function MythicRouteMap(props: Omit<ComponentProps<typeof MythicRouteMapClient>, "names">) {
  return <MythicRouteMapClient {...props} names={mythicRouteNames(props.locale, props.dungeon, props.dungeonOptions, props.combatIntel)} />;
}
