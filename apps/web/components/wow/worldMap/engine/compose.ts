import type { AtlasMap } from "@/lib/wow/worldMap/bundle";
import type { DrawnMap } from "./WorldMapEngine";

/** Pure rules of how a frame is put together (unit-tested). */

/**
 * The passes of a frame: blurred runs split where ancestors (backdrops) meet the maps over them (neighbours
 * must never go under a backdrop in a shared layer), and runs of sharp neighbours (or of the children of the
 * map in view) gathered into one flat layer.
 */
export function layerGroups(groups: Array<{ from: number; to: number; blur: number }>, list: DrawnMap[]) {
  const out: Array<{ from: number; to: number; blur: number; flat?: boolean }> = [];
  const back = (i: number) => list[i].role === "ancestor";
  for (const group of groups) {
    if (group.blur > 0) {
      let from = group.from;
      for (let i = group.from + 1; i <= group.to + 1; i++) {
        if (i <= group.to && back(i) === back(from)) continue;
        out.push({ from, to: i - 1, blur: group.blur });
        from = i;
      }
      continue;
    }
    const last = out[out.length - 1];
    const role = list[group.from].role;
    const beside = (role === "neighbour" || role === "child") && group.from === group.to;
    if (beside && last?.flat && last.to === group.from - 1 && list[last.from].role === role) last.to = group.to;
    else out.push(beside ? { ...group, flat: true } : { ...group });
  }
  for (const group of out) if (group.flat && group.to === group.from) delete group.flat;
  return out;
}

/**
 * What says two maps show one place: the same name (the old Silvermoon beside Midnight's), or the data's
 * own link (`samePlace`: a phase or another picture of that place's main map).
 */
export const placeKeys = (map: AtlasMap | undefined): string[] =>
  !map || map.depth === 0 ? [] : [`n:${map.name}`, `v:${map.samePlace === undefined ? map.id : Math.min(map.id, map.samePlace)}`];
