"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { RouteStop } from "@/lib/data/wow/mythic/rubyLifePoolsData";
import type { WowNameTable } from "@/lib/wow/wowNameTable";
import type { RouteLocale } from "./mythicRouteCopy";

/** The source names the planner can show; MythicRouteMap.tsx picks them on the server. */
export const RouteNamesContext = createContext<WowNameTable | null>(null);

export function useRouteNames() {
  const names = useContext(RouteNamesContext);
  if (!names) throw new Error("useRouteNames needs a RouteNamesContext provider (MythicRouteMapClient).");
  return names;
}

/** Strings of a step that reach the name translators; a split pull only appends " · A"/" · B" to its title. */
const stopTexts = (stop: RouteStop) => [
  stop.title.replace(/( · [AB])+$/, ""), stop.subtitle, stop.summary, stop.tank, stop.healer, stop.dps, ...(stop.callouts ?? []),
  ...stop.enemies.map((enemy) => enemy.name),
  ...(stop.abilities ?? []).flatMap((ability) => [ability.name, ability.target, ability.source ?? ""]),
];

/**
 * The page's names cover the built-in route. A saved or imported route with
 * other text loads the full table, so it reads exactly as before.
 */
export function useRouteNameTable(locale: RouteLocale, pageNames: WowNameTable, initialStops: RouteStop[], stops: RouteStop[]) {
  const [fullNames, setFullNames] = useState<WowNameTable | null>(null);
  const known = useMemo(() => new Set(initialStops.flatMap(stopTexts)), [initialStops]);
  const uncovered = useMemo(
    () => locale === "ru" && stops !== initialStops && stops.some((stop) => stopTexts(stop).some((text) => !known.has(text))),
    [initialStops, known, locale, stops],
  );
  useEffect(() => {
    if (!uncovered || fullNames) return;
    let active = true;
    void import("@/lib/wow/fullWowNameTable").then((module) => { if (active) setFullNames(module.fullWowNameTable); });
    return () => { active = false; };
  }, [fullNames, uncovered]);
  return fullNames ?? pageNames;
}
