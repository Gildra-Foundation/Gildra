import { comparePatch, patchParts, type ArtEraInfo, type AtlasBundle, type AtlasEra, type AtlasEvent, type AtlasMap, type Lang } from "@/lib/wow/worldMap/bundle";
import { EXPANSIONS, worldMapCopy } from "./worldMapCopy";

/** Shared by the server page and the viewer: facts, timeline positions, eras. */

/** A zone inside a zone is a city (Orgrimmar in Durotar); so is a zone named like a capital marker. */
export function isCity(map: AtlasMap, byId: Map<number, AtlasMap>, capitals: ReadonlySet<string | number>) {
  // Micro maps are caves, keeps and districts inside a zone, not cities.
  if (map.type !== "zone") return false;
  const parent = map.parent === null ? undefined : byId.get(map.parent);
  return parent?.type === "zone" || capitals.has(map.id) || capitals.has(map.name);
}

/** Maps opened by a capital or city marker (by id), and those markers' names. */
export function capitalNames(bundle: AtlasBundle) {
  const out = new Set<string | number>();
  for (const poi of bundle.pois) {
    if (poi.kind !== "capital" && poi.kind !== "city") continue;
    out.add(poi.name);
    if (poi.target) out.add(poi.target);
  }
  return out;
}

function list(lang: Lang, names: string[], limit = 4) {
  const copy = worldMapCopy[lang];
  if (names.length <= limit) return names.join(", ");
  return names.slice(0, limit).join(", ") + copy.and(names.length - limit);
}

/** One factual line about a map, from its place in the hierarchy. */
export function mapLine(lang: Lang, map: AtlasMap, bundle: AtlasBundle) {
  const copy = worldMapCopy[lang];
  const byId = new Map(bundle.maps.map((entry) => [entry.id, entry]));
  const capitals = capitalNames(bundle);
  const up = (type: AtlasMap["type"]) => {
    for (let m = map.parent === null ? undefined : byId.get(map.parent); m; m = m.parent === null ? undefined : byId.get(m.parent)) if (m.type === type) return m;
    return undefined;
  };
  const kids = map.children.map((id) => byId.get(id)).filter((m): m is AtlasMap => Boolean(m));
  if (map.type === "cosmic") return copy.lede;
  if (map.type === "world") return kids.length ? copy.line.world(list(lang, kids.map((m) => m.name))) : "";
  if (map.type === "continent") return copy.line.continent(up("world")?.name ?? "", list(lang, kids.filter((m) => !isCity(m, byId, capitals)).map((m) => m.name)));
  if (isCity(map, byId, capitals)) {
    // The game hangs a city on its zone (Thunder Bluff in Mulgore) or straight on the continent (Orgrimmar).
    const parent = map.parent === null ? undefined : byId.get(map.parent);
    if (parent?.type === "zone") return copy.line.city(parent.name, up("continent")?.name ?? "");
    return copy.line.cityOn(up("continent")?.name ?? parent?.name ?? "");
  }
  const cities = kids.filter((m) => isCity(m, byId, capitals)).map((m) => m.name);
  const continent = up("continent")?.name ?? up("world")?.name ?? "";
  return continent ? copy.line.zone(continent, list(lang, cities)) : "";
}

/** Position on the timeline: 0 at Classic's launch, 1 per expansion. */
export function patchPosition(patch: string) {
  const [major = 1, minor = 0, build = 0] = patchParts(patch);
  const index = Math.max(0, Math.min(EXPANSIONS.length - 1, major - 1));
  return index + Math.min(0.96, minor * 0.1 + build * 0.01);
}

/** Eras in time order; the current game's era is the latest. */
export function orderedEras(eras: AtlasEra[]) {
  return [...eras].sort((a, b) => comparePatch(a.range[0], b.range[0]));
}
export const currentEra = (eras: AtlasEra[]) => orderedEras(eras).at(-1) ?? null;

/** The era a timeline position falls into (else the last one that started before it). */
export function eraAt(eras: AtlasEra[], position: number) {
  const ordered = orderedEras(eras);
  let found: AtlasEra | null = ordered[0] ?? null;
  for (const era of ordered) if (patchPosition(era.range[0]) <= position + 1e-6) found = era;
  return found;
}

/** Where the thumb rests in an era: early in it (its own art is in place); at today's end for the latest. */
export function restOf(eras: AtlasEra[], era: AtlasEra) {
  const latest = orderedEras(eras).at(-1);
  if (era.id === latest?.id) return Math.min(EXPANSIONS.length - 0.04, patchPosition(era.range[1]) + 0.4);
  return Math.min(patchPosition(era.range[1]), patchPosition(era.range[0]) + 0.05);
}

/**
 * The art at a moment of the timeline: the client era it falls into (else the
 * last one that began before), plus its variants running then (Theramore in
 * ruins from 5.1).
 */
export function artErasAt(art: ArtEraInfo[], position: number): ArtEraInfo[] {
  const inside = (era: ArtEraInfo) => patchPosition(era.range[0]) <= position + 1e-6 && position <= patchPosition(era.range[1]) + 0.009;
  const mains = art.filter((era) => !era.inherits);
  const base = mains.find(inside)
    ?? [...mains].filter((era) => patchPosition(era.range[0]) <= position).sort((a, b) => patchPosition(b.range[0]) - patchPosition(a.range[0]))[0]
    ?? mains[0];
  if (!base) return [];
  return [base, ...art.filter((era) => era.inherits === base.id && inside(era))];
}
export const artKey = (eras: ArtEraInfo[]) => eras.map((era) => era.id).join("+") || "current";

/**
 * The view in the URL: ?x=&y= is the centre in the page map's own 0..1 space,
 * z the zoom in powers of two over "the map shown whole" (fitScale). Omitted
 * at the map's home view. Pure, so a link opens the same view in any era
 * whose hierarchy draws that map elsewhere.
 */
export type ViewQuery = { x: number; y: number; z: number } | null;
type Frame = [number, number, number, number];
type View = { x: number; y: number; scale: number };

export function viewToQuery(camera: View, frame: Frame, fitScale: number, fitCentre: { x: number; y: number }): ViewQuery {
  const z = Math.log2(camera.scale / fitScale);
  const home = Math.abs(z) < 0.05 && Math.abs(camera.x - fitCentre.x) * fitScale < 8 && Math.abs(camera.y - fitCentre.y) * fitScale < 8;
  if (home) return null;
  const w = frame[2] - frame[0], h = frame[3] - frame[1];
  const round = (v: number, digits: number) => Number(v.toFixed(digits));
  return { x: round((camera.x - frame[0]) / w, 4), y: round((camera.y - frame[1]) / h, 4), z: round(z, 2) };
}

export function queryToView(query: ViewQuery, frame: Frame, fitScale: number): View | null {
  if (!query || ![query.x, query.y, query.z].every(Number.isFinite)) return null;
  const w = frame[2] - frame[0], h = frame[3] - frame[1];
  return { x: frame[0] + query.x * w, y: frame[1] + query.y * h, scale: fitScale * 2 ** Math.max(-3, Math.min(14, query.z)) };
}

/** The map of a map page path (/ru/wow/map/85-orgrimmar → 85; /wow/map → home). */
export function mapIdOfPath(pathname: string, homeId: number | null): number | null {
  const match = /\/wow\/map\/(\d+)-[a-z0-9-]+\/?$/.exec(pathname);
  if (match) return Number(match[1]);
  return /\/wow\/map\/?$/.test(pathname) ? homeId : null;
}

/**
 * Should a settled view add a history entry (Back returns to it)? Yes when the
 * page map changed by flying there or by going a level deeper or up; panning
 * across neighbouring maps only rewrites the current entry.
 */
export function pushesHistory(prev: { mapId: number; depth: number } | null, next: { mapId: number; depth: number }, flown: boolean) {
  if (!prev || prev.mapId === next.mapId) return false;
  return flown || prev.depth !== next.depth;
}

/**
 * A timeline position as a patch for the URL (?at=, ?cmp=): 4.1 → "5.1.0",
 * 4.089 → "5.0.9". patchPosition reads it back to within 0.005.
 */
export function positionToPatch(position: number) {
  const index = Math.max(0, Math.floor(position + 1e-9));
  const rest = Math.max(0, position - index);
  let minor = Math.floor(rest * 10 + 1e-6);
  let build = Math.round((rest - minor * 0.1) * 100);
  if (build >= 10) { minor += 1; build -= 10; }
  return `${index + 1}.${minor}.${build}`;
}

/** Art-era ids of older links (the eras were split since). */
const ERA_ALIASES: Record<string, string> = { "warlords-legion": "warlords-of-draenor" };

/**
 * The timeline era a ?era= value names: a timeline id (vanilla … midnight), or
 * an art era's id (warlords-of-draenor, an older warlords-legion) — that era's
 * first patch on the timeline.
 */
export function eraFromParam(value: string | null, eras: AtlasEra[], art: ArtEraInfo[]): AtlasEra | undefined {
  if (!value) return undefined;
  const direct = eras.find((era) => era.id === value);
  if (direct) return direct;
  const id = ERA_ALIASES[value] ?? value;
  const picture = art.find((era) => era.id === id);
  return picture ? eraAt(eras, patchPosition(picture.range[0])) ?? undefined : undefined;
}

/**
 * A phase of the art that an event brings (Theramore in ruins from 5.1 while
 * the event's patch is 5.0.4): the first variant changing the event's maps
 * that starts within a patch after it.
 */
function eventPhase(event: Pick<AtlasEvent, "patch" | "map" | "changed">, art: ArtEraInfo[]) {
  const at = patchPosition(event.patch);
  const ids = new Set([...(event.map !== null ? [event.map] : []), ...(event.changed ?? [])]);
  return art
    .filter((info) => info.inherits && info.changed.some((id) => ids.has(id)) && patchPosition(info.range[0]) >= at - 1e-6 && patchPosition(info.range[0]) - at < 1)
    .sort((a, b) => patchPosition(a.range[0]) - patchPosition(b.range[0]))[0];
}

/** The moment that shows an event's result on the map (its phase when it brings one). */
export function eventMoment(event: Pick<AtlasEvent, "patch" | "map" | "changed">, art: ArtEraInfo[]) {
  const phase = eventPhase(event, art);
  return phase ? patchPosition(phase.range[0]) : patchPosition(event.patch);
}

/**
 * The before/after pair of an event: the last picture before its result on
 * the left, the result on the right — a phase of the art first (Theramore
 * standing → in ruins), else the change of client picture at its patch, else
 * its "before" era. null when the map does not change.
 */
export function eventComparison(event: Pick<AtlasEvent, "patch" | "map" | "changed" | "before">, art: ArtEraInfo[], eras: AtlasEra[]): { left: number; right: number } | null {
  const phase = eventPhase(event, art);
  if (phase) { const start = patchPosition(phase.range[0]); return { left: start - 0.011, right: start }; }
  const at = patchPosition(event.patch);
  if (artKey(artErasAt(art, at - 0.011)) !== artKey(artErasAt(art, at))) return { left: at - 0.011, right: at };
  const before = event.before ? eras.find((era) => era.id === event.before) : undefined;
  return before ? { left: restOf(eras, before), right: at } : null;
}
