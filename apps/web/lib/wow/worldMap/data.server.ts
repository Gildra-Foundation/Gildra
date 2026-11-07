import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildAtlasBundle, mapPageParam, type AtlasBundle, type AtlasMap, type Lang } from "./bundle";
import type { WorldMapData } from "./types";

/**
 * Server side of the world map: reads the data contract files of
 * data/wow/map/ (maps, pois, eras, events). Development without the pipeline's
 * files can point GILDRA_WORLD_MAP_DATA at another folder with the same files
 * (the viewer's test data lives in tests/fixtures/world-map).
 */
function dataDir() {
  const override = process.env.GILDRA_WORLD_MAP_DATA;
  return override ? path.resolve(process.cwd(), override) : path.join(process.cwd(), "data/wow/map");
}

function readJson<T>(dir: string, name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

let cached: { data: WorldMapData; version: string; bundles: Partial<Record<Lang, AtlasBundle>> } | null = null;

function load() {
  if (cached) return cached;
  const dir = dataDir();
  const data: WorldMapData = {
    maps: readJson(dir, "maps.json", []),
    pois: readJson(dir, "pois.json", []),
    eras: readJson(dir, "eras.json", []),
    events: readJson(dir, "events.json", []),
  };
  const version = createHash("sha1").update(JSON.stringify(data)).digest("hex").slice(0, 10);
  cached = { data, version, bundles: {} };
  return cached;
}

export function worldMapBundle(lang: Lang): AtlasBundle {
  const state = load();
  return (state.bundles[lang] ??= buildAtlasBundle(state.data, lang));
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
