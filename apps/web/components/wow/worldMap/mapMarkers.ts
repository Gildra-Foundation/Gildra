import type { AtlasBundle, AtlasEra, AtlasEvent, AtlasMap, AtlasPoi } from "@/lib/wow/worldMap/bundle";
import type { PoiKind } from "@/lib/wow/worldMap/types";
import { contains } from "./engine/camera";
import type { FrameInfo } from "./engine/WorldMapEngine";
import { paintedBoxes, paintedOf } from "./ui/paintedArt";

/**
 * Which markers and labels the map shows at the current view: points of the
 * maps that are well in view, names of the child maps not opened yet, events
 * of the timeline — then the most important ones that do not overlap.
 */
export type Layers = { cities: boolean; instances: boolean; flight: boolean; portals: boolean; events: boolean; labels: boolean; alive: boolean };
export const DEFAULT_LAYERS: Layers = { cities: true, instances: true, flight: true, portals: true, events: true, labels: true, alive: true };

export type Marker =
  | { key: string; type: "poi"; kind: PoiKind; label: string; ax: number; ay: number; priority: number; showLabel: boolean; poi: AtlasPoi; faction?: string; side?: LabelSide }
  | { key: string; type: "map"; label: string; ax: number; ay: number; priority: number; map: AtlasMap; capital: boolean; faction?: string; size: "world" | "continent" | "zone"; quiet: boolean; covers?: boolean; shift?: number }
  | { key: string; type: "event"; label: string; ax: number; ay: number; priority: number; event: AtlasEvent; current: boolean };

const MIN_WIDTH: Record<PoiKind, number> = { capital: 180, city: 640, town: 1000, dungeon: 520, raid: 420, delve: 900, flight: 1200, portal: 900, "zone-label": 240 };
const PRIORITY: Record<PoiKind, number> = { capital: 1, "zone-label": 2, raid: 3, city: 3, dungeon: 4, delve: 5, town: 5, portal: 6, flight: 7 };
const LAYER: Record<PoiKind, keyof Layers> = { capital: "cities", city: "cities", town: "cities", dungeon: "instances", raid: "instances", delve: "instances", flight: "flight", portal: "portals", "zone-label": "labels" };

/** Where a point's name hangs off its icon: under it first, then to the right, above, to the left. */
export type LabelSide = "below" | "right" | "above" | "left";
const SIDES: LabelSide[] = ["below", "right", "above", "left"];

export type MarkerIndex = {
  poisByMap: Map<number, AtlasPoi[]>;
  eventsByMap: Map<number, AtlasEvent[]>;
  capitals: Map<string, AtlasPoi>;
  byId: Map<number, AtlasMap>;
};

export function indexMarkers(bundle: Pick<AtlasBundle, "maps" | "pois" | "events">): MarkerIndex {
  const poisByMap = new Map<number, AtlasPoi[]>();
  for (const poi of bundle.pois) poisByMap.set(poi.map, [...(poisByMap.get(poi.map) ?? []), poi]);
  const eventsByMap = new Map<number, AtlasEvent[]>();
  for (const event of bundle.events) if (event.map !== null) eventsByMap.set(event.map, [...(eventsByMap.get(event.map) ?? []), event]);
  const capitals = new Map<string, AtlasPoi>();
  for (const poi of bundle.pois) if (poi.kind === "capital" || poi.kind === "city") capitals.set(poi.name, poi);
  return { poisByMap, eventsByMap, capitals, byId: new Map(bundle.maps.map((map) => [map.id, map])) };
}

const point = (map: AtlasMap, x: number, y: number): [number, number] =>
  [map.frame[0] + x * (map.frame[2] - map.frame[0]), map.frame[1] + y * (map.frame[3] - map.frame[1])];

/** Glyph widths of the label styles (worldMapViewer.module.css), in px per character. */
const CHAR = { world: 15.5, continent: 11.6, zone: 8.6, capital: 8.6, point: 7.2 } as const;

type Box = [number, number, number, number];
type Placed = Marker & { sx: number; sy: number };
const inside = (box: Box, width: number, height: number) => box[0] >= 2 && box[2] <= width - 2 && box[1] >= 2 && box[3] <= height - 2;
const hits = (box: Box, boxes: Box[]) => boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);

/** The screen box of a map's name (zone names, capitals with their seal). */
function mapBox(marker: Extract<Placed, { type: "map" }>, shift: number): Box {
  const w = marker.label.length * CHAR[marker.size] + 16;
  const sy = marker.sy + shift;
  return marker.capital ? [marker.sx - w / 2, sy - 15, marker.sx + w / 2, sy + 44] : [marker.sx - w / 2, sy - 13, marker.sx + w / 2, sy + 13];
}
const iconSize = (marker: Placed) => (marker.type === "poi" && marker.kind === "capital" ? 30 : marker.type === "poi" && (marker.kind === "town" || marker.kind === "flight") ? 20 : marker.type === "event" ? 28 : 26);
function iconBox(marker: Placed): Box {
  const r = iconSize(marker) / 2;
  return [marker.sx - r, marker.sy - r, marker.sx + r, marker.sy + r];
}
/** The box of a point's name on one side of its icon. */
function nameBox(marker: Placed, side: LabelSide): Box {
  const big = marker.type === "poi" && (marker.kind === "capital" || marker.kind === "city");
  const w = marker.label.length * (big ? CHAR.capital : CHAR.point) + 10, h = big ? 20 : 17;
  const r = iconSize(marker) / 2, { sx, sy } = marker;
  if (side === "below") return [sx - w / 2, sy + r + 1, sx + w / 2, sy + r + 1 + h];
  if (side === "above") return [sx - w / 2, sy - r - 1 - h, sx + w / 2, sy - r - 1];
  if (side === "right") return [sx + r + 3, sy - h / 2, sx + r + 3 + w, sy + h / 2];
  return [sx - r - 3 - w, sy - h / 2, sx - r - 3, sy + h / 2];
}

export function pickMarkers(info: FrameInfo, index: MarkerIndex, layers: Layers, era: AtlasEra | null, project: (x: number, y: number) => [number, number], artIn: (map: AtlasMap) => unknown, lang: "en" | "ru" = "en"): Array<Marker & { sx: number; sy: number }> {
  // Words the game painted into the pictures in view: labels keep clear of them.
  const painted: Box[] = [];
  for (const entry of info.drawn) {
    if (entry.alpha < 0.55) continue;
    for (const [x0, y0, x1, y1] of paintedBoxes(entry.map)) {
      const [a, b] = project(x0, y0), [c, d] = project(x1, y1);
      if (c > 0 && a < info.width && d > 0 && b < info.height) painted.push([a, b, c, d]);
    }
  }
  const drawnAlpha = new Map(info.drawn.map((entry) => [entry.map.id, entry.alpha]));
  const out: Marker[] = [];
  const seenEvents = new Set<string>();
  for (const entry of info.drawn) {
    const { map, alpha, screen } = entry;
    const width = screen[2] - screen[0];
    if (alpha < 0.55) continue;
    const kids = map.children.map((id) => index.byId.get(id)).filter((child): child is AtlasMap => Boolean(child) && Boolean(artIn(child as AtlasMap)));
    const openKid = (ax: number, ay: number) => kids.some((child) => (drawnAlpha.get(child.id) ?? 0) > 0.7 && contains(child.box, ax, ay));
    const labelled = new Set<string>();
    const targeted = new Set<number>();
    // Art that names its zones itself: our names show on hover (EN) or as plaques over the painted words (RU).
    const namesPainted = Boolean(paintedOf(map)?.names);
    // The map the reader stands in shows all its points sooner.
    const near = info.focus.id === map.id ? 0.5 : 1;
    for (const poi of index.poisByMap.get(map.id) ?? []) {
      if (poi.target) targeted.add(poi.target);
      if (!layers[LAYER[poi.kind]] || width < MIN_WIDTH[poi.kind] * near) continue;
      if (poi.kind === "zone-label" && width > 3600) continue;
      const [ax, ay] = point(map, poi.x, poi.y);
      // A point that opens a map (a capital) stays until that map itself is in view.
      if (poi.target) { if ((drawnAlpha.get(poi.target) ?? 0) > 0.6) continue; }
      else if (poi.kind !== "zone-label" && openKid(ax, ay)) continue;
      if (poi.kind === "zone-label") labelled.add(poi.name);
      // A zone name that opens its zone: the same clickable label as a child map's name.
      const target = poi.kind === "zone-label" && poi.target ? index.byId.get(poi.target) : undefined;
      if (target) {
        if (!artIn(target)) continue;
        out.push({
          key: `m${target.id}`, type: "map", label: poi.name, ax, ay, priority: map.type === "world" || map.type === "cosmic" ? 9 : 2,
          map: target, capital: false, size: map.type === "cosmic" || map.type === "world" ? "world" : map.type === "continent" ? "continent" : "zone",
          quiet: map.type === "cosmic" || map.type === "world" || (namesPainted && lang === "en"),
          covers: namesPainted && lang !== "en" && map.type !== "cosmic" && map.type !== "world",
        });
        continue;
      }
      if (poi.kind === "zone-label" && namesPainted) continue;
      const showLabel = poi.kind === "capital" || poi.kind === "city" || poi.kind === "zone-label" || (poi.kind === "town" && width > 1400 * near) || ((poi.kind === "raid" || poi.kind === "dungeon" || poi.kind === "delve") && width > 1500 * near);
      out.push({ key: `p${poi.id}`, type: "poi", kind: poi.kind, label: poi.name, ax, ay, priority: PRIORITY[poi.kind], showLabel, poi, faction: poi.faction });
    }
    // Names of child maps not opened yet: click to fly in.
    if (layers.labels && width >= 240) {
      for (const child of kids) {
        if ((drawnAlpha.get(child.id) ?? 0) > 0.6 || labelled.has(child.name) || targeted.has(child.id)) continue;
        const [x0] = project(child.box[0], child.box[1]);
        const [x1] = project(child.box[2], child.box[3]);
        if (x1 - x0 < 46) continue;
        const capital = index.capitals.get(child.name);
        if (capital && !layers.cities) continue;
        const cx = (child.box[0] + child.box[2]) / 2, cy = (child.box[1] + child.box[3]) / 2;
        out.push({
          key: `m${child.id}`, type: "map", label: child.name, ax: cx, ay: cy, priority: capital ? 1 : map.type === "world" || map.type === "cosmic" ? 9 : 2,
          map: child, capital: Boolean(capital), faction: capital?.faction, size: map.type === "cosmic" || map.type === "world" ? "world" : map.type === "continent" ? "continent" : "zone",
          // The Cosmic and world pictures carry their own painted names: ours shows on hover only.
          quiet: map.type === "cosmic" || map.type === "world" || (namesPainted && lang === "en"),
          covers: namesPainted && lang !== "en" && map.type !== "cosmic" && map.type !== "world",
        });
      }
    }
    if (layers.events) {
      for (const event of index.eventsByMap.get(map.id) ?? []) {
        if (seenEvents.has(event.id) || width < 160) continue;
        seenEvents.add(event.id);
        const [ax, ay] = point(map, event.x, event.y);
        const current = !era || event.era === era.id || event.after === era.id;
        out.push({ key: `e${event.id}`, type: "event", label: event.title, ax, ay, priority: current ? 0 : 3, event, current });
      }
    }
  }
  // Project, cull, then place the most important first without overlaps; fewer on a small screen.
  const placed: Placed[] = [];
  const boxes: Box[] = [];
  const cap = Math.round(Math.max(24, Math.min(140, (info.width * info.height) / 6500)));
  const sorted = out.map((marker) => {
    const [sx, sy] = project(marker.ax, marker.ay);
    return { ...marker, sx, sy } as Placed;
  }).filter((marker) => marker.sx > -40 && marker.sy > -40 && marker.sx < info.width + 40 && marker.sy < info.height + 40)
    .sort((a, b) => a.priority - b.priority);
  for (const marker of sorted) {
    if (marker.type === "map") {
      // Hover-only names over painted ones never push a visible marker away.
      if (marker.quiet) { placed.push(marker); continue; }
      // A plaque over a painted name sits right on it; other names may step up or down to clear the art's words.
      const shifts = marker.capital || marker.covers ? [0] : [0, -18, 18];
      const shift = shifts.find((dy) => { const box = mapBox(marker, dy); return !hits(box, boxes) && (marker.covers || !hits(box, painted)) && (dy === 0 || inside(box, info.width, info.height)); });
      if (shift === undefined) continue;
      boxes.push(mapBox(marker, shift));
      placed.push(shift ? { ...marker, shift } : marker);
    } else {
      const icon = iconBox(marker);
      if (hits(icon, boxes)) continue;
      if (marker.type !== "poi" || !marker.showLabel) { boxes.push(icon); placed.push(marker); }
      else {
        // The name goes to the first free side; with none free the icon stays and its name shows on hover.
        // A name cut by the screen edge goes to the other side.
        const side = SIDES.find((option) => { const box = nameBox(marker, option); return !hits(box, boxes) && !hits(box, painted) && inside(box, info.width, info.height); })
          ?? SIDES.find((option) => { const box = nameBox(marker, option); return !hits(box, boxes) && !hits(box, painted); });
        boxes.push(icon);
        if (side) boxes.push(nameBox(marker, side));
        placed.push(side ? { ...marker, side } : { ...marker, showLabel: false });
      }
    }
    if (placed.length >= cap) break;
  }
  return placed;
}
