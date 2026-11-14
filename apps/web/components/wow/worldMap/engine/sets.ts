import type { ArtEra, AtlasMap } from "@/lib/wow/worldMap/bundle";
import type { Box, Camera } from "./camera";

/**
 * Map sets: the maps of one moment of the timeline (the current maps, or an
 * era's: other art, other places, other hierarchy) and moving the camera
 * between two sets so it keeps looking at the same place. Pure, unit-tested.
 */
export type MapSet = { key: string; maps: Map<number, AtlasMap>; shown: Map<number, Box> };

/** The part of each map inside its parents: children may overhang (Kalimdor past the edge of Azeroth). */
function shownBoxes(maps: Map<number, AtlasMap>) {
  const shown = new Map<number, Box>();
  for (const map of maps.values()) {
    let box: Box = map.frame;
    for (let m = map; m.parent !== null && !m.portal; ) {
      const parent = maps.get(m.parent);
      if (!parent) break;
      box = [Math.max(box[0], parent.frame[0]), Math.max(box[1], parent.frame[1]), Math.min(box[2], parent.frame[2]), Math.min(box[3], parent.frame[3])];
      m = parent;
    }
    shown.set(map.id, box[2] > box[0] && box[3] > box[1] ? box : map.frame);
  }
  return shown;
}

export function mapSet(key: string, maps: Iterable<AtlasMap>): MapSet {
  const byId = new Map<number, AtlasMap>();
  for (const map of maps) byId.set(map.id, map);
  return { key, maps: byId, shown: shownBoxes(byId) };
}

/**
 * An era's maps: the current maps that existed then, its own maps over them,
 * then its variants' maps. A map whose parent is not in the set is left out
 * (with its own children): an era never shows a place hanging nowhere.
 */
export function composeSet(key: string, base: MapSet, eras: ArtEra[]): MapSet {
  const [first, ...variants] = eras;
  const maps = new Map<number, AtlasMap>();
  if (first) {
    if (first.only) for (const id of first.only) { const m = base.maps.get(id); if (m) maps.set(id, m); }
    else for (const [id, m] of base.maps) maps.set(id, m);
    for (const m of first.own) maps.set(m.id, m);
  } else for (const [id, m] of base.maps) maps.set(id, m);
  for (const variant of variants) for (const m of variant.own) maps.set(m.id, m);
  // Children lists follow the set: a parent keeps only children that are in it and still hang on it.
  const kept = new Map<number, AtlasMap>();
  const keep = (map: AtlasMap) => {
    if (kept.has(map.id)) return;
    kept.set(map.id, map);
    for (const id of map.children) {
      const child = maps.get(id);
      if (child && child.parent === map.id) keep(child);
    }
  };
  for (const map of maps.values()) if (map.depth === 0 || map.parent === null) keep(map);
  for (const [id, map] of kept) {
    const children = map.children.filter((c) => kept.get(c)?.parent === id);
    if (children.length !== map.children.length) kept.set(id, { ...map, children });
  }
  return { key, maps: kept, shown: shownBoxes(kept) };
}

/**
 * The same place in another set: anchored on the deepest map of `chain`
 * (deepest first) that both sets have — its art may be another picture of the
 * same land, so the camera keeps the same point and zoom relative to it.
 * null when none of them exists in the other set.
 */
export function transferCamera(camera: Camera, from: MapSet, to: MapSet, chain: number[]): Camera | null {
  if (from === to) return camera;
  for (const id of chain) {
    const a = from.maps.get(id)?.frame, b = to.maps.get(id)?.frame;
    if (!a || !b) continue;
    const sx = (b[2] - b[0]) / (a[2] - a[0]), sy = (b[3] - b[1]) / (a[3] - a[1]);
    return { x: b[0] + (camera.x - a[0]) * sx, y: b[1] + (camera.y - a[1]) * sy, scale: camera.scale / sx };
  }
  return null;
}

/** A map and its ancestors in a set, deepest first. */
export function chainUp(set: MapSet, id: number) {
  const out: number[] = [];
  for (let map = set.maps.get(id); map && out.length < 32; map = map.parent === null ? undefined : set.maps.get(map.parent)) out.push(map.id);
  return out;
}
