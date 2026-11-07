import type { AtlasEvent } from "@/lib/wow/worldMap/bundle";
import { EXPANSIONS } from "../worldMapCopy";
import { patchPosition } from "../worldMapModel";

const SPAN = EXPANSIONS.length;

/** Runes at least RUNE_GAP px apart: a closer event joins the rune before it (that rune stays where its first event is). */
export const RUNE_GAP = 16;
export function groupRunes(ordered: AtlasEvent[], width: number) {
  const out: AtlasEvent[][] = [];
  const px = (event: AtlasEvent) => (patchPosition(event.patch) / SPAN) * Math.max(1, width);
  for (const event of ordered) {
    const last = out.at(-1);
    if (last && px(event) - px(last[0]) < RUNE_GAP) last.push(event);
    else out.push([event]);
  }
  return out;
}
