import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildAtlasBundle, mapPageParam, type ArtEra, type AtlasBundle, type AtlasMap, type Lang } from "./bundle";
import type { WorldMapData } from "./types";

/**
 * Server side of the world map: reads the data contract files of
 * data/wow/map/ (maps, pois, eras, events). Development without the pipeline's
 * files can point GILDRA_WORLD_MAP_DATA at another folder with the same files
 * (the viewer's test data lives in tests/fixtures/world-map).
 */
function readJson<T>(name: string, fallback: T): T {
  const override = process.env.GILDRA_WORLD_MAP_DATA;
  // The build traces only data/wow/map; the development override is left out of the trace.
  const file = override
    ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), override, name)
    : path.join(process.cwd(), "data", "wow", "map", name);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

let cached: { data: WorldMapData; version: string; bundles: Partial<Record<Lang, AtlasBundle & { artEras: ArtEra[] }>> } | null = null;

function load() {
  if (cached) return cached;
  const data: WorldMapData = {
    maps: readJson("maps.json", []),
    pois: readJson("pois.json", []),
    eras: readJson("eras.json", []),
    eraMeta: readJson("eras-meta.json", []),
    events: readJson("events.json", []),
  };
  const version = createHash("sha1").update(JSON.stringify(data)).digest("hex").slice(0, 10);
  cached = { data, version, bundles: {} };
  return cached;
}

function full(lang: Lang) {
  const state = load();
  return (state.bundles[lang] ??= buildAtlasBundle(state.data, lang));
}

/** The viewer's main bundle (the art eras' maps are served one by one). */
export function worldMapBundle(lang: Lang): AtlasBundle {
  const { artEras: _artEras, ...bundle } = full(lang);
  void _artEras;
  return bundle;
}

/** One art era's maps and points. */
export function worldMapArtEra(lang: Lang, id: string): ArtEra | null {
  return full(lang).artEras.find((era) => era.id === id) ?? null;
}

export function worldMapArtEraIds() {
  return full("en").artEras.map((era) => era.id);
}

/** Changes with the data: the viewer's bundle URL carries it so a new release never serves a stale copy. */
export const worldMapVersion = () => load().version;

export function worldMapAvailable() {
  return worldMapBundle("en").maps.length > 0;
}

/** Pages of the map: worlds, continents and zones of the main hierarchy. */
export function worldMapPages(): AtlasMap[] {
  return worldMapBundle("en").maps.filter((map) => map.page);
}

export function worldMapPageByParam(param: string, lang: Lang) {
  const id = Number.parseInt(param, 10);
  const map = worldMapBundle(lang).maps.find((entry) => entry.id === id);
  return map && map.page && mapPageParam(map) === param ? map : null;
}

/** The top map shown at /wow/map: the Cosmic map, else the first world. */
export function worldMapHome(lang: Lang) {
  const maps = worldMapBundle(lang).maps;
  return maps.find((map) => map.type === "cosmic" && map.depth === 0) ?? maps.find((map) => map.type === "world") ?? maps[0] ?? null;
}

/** The map and its ancestors, top first. */
export function worldMapChain(map: AtlasMap, lang: Lang) {
  const byId = new Map(worldMapBundle(lang).maps.map((entry) => [entry.id, entry]));
  const chain: AtlasMap[] = [];
  for (let current: AtlasMap | undefined = map; current; current = current.parent === null ? undefined : byId.get(current.parent)) chain.unshift(current);
  return chain;
}

export function worldMapChildren(map: AtlasMap, lang: Lang) {
  const byId = new Map(worldMapBundle(lang).maps.map((entry) => [entry.id, entry]));
  return map.children.map((id) => byId.get(id)).filter((child): child is AtlasMap => Boolean(child));
}
