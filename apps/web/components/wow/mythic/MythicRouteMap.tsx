import type { ComponentProps } from "react";
import { AtlasLegalFooter } from "@/components/atlas";
import { MythicRouteMapClient } from "./MythicRouteMapClient";
import { mythicRouteNames } from "./mythicRouteNames";

/** The route planner with only the source names this page can show, so the dictionaries stay on the server; the site's one legal footer closes it. */
export function MythicRouteMap(props: Omit<ComponentProps<typeof MythicRouteMapClient>, "names" | "footer">) {
  return <MythicRouteMapClient {...props} names={mythicRouteNames(props.locale, props.dungeon, props.dungeonOptions, props.combatIntel)} footer={<AtlasLegalFooter lang={props.locale} />} />;
}
