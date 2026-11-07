import { comparePatch, patchParts, type ArtEraInfo, type AtlasBundle, type AtlasEra, type AtlasMap, type Lang } from "@/lib/wow/worldMap/bundle";
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
