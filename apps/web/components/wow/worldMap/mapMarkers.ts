import type { AtlasBundle, AtlasEra, AtlasEvent, AtlasMap, AtlasPoi } from "@/lib/wow/worldMap/bundle";
import type { PoiKind } from "@/lib/wow/worldMap/types";
import { contains } from "./engine/camera";
import type { FrameInfo } from "./engine/WorldMapEngine";

/**
 * Which markers and labels the map shows at the current view: points of the
 * maps that are well in view, names of the child maps not opened yet, events
 * of the timeline — then the most important ones that do not overlap.
 */
export type Layers = { cities: boolean; instances: boolean; flight: boolean; portals: boolean; events: boolean; labels: boolean; alive: boolean };
export const DEFAULT_LAYERS: Layers = { cities: true, instances: true, flight: true, portals: true, events: true, labels: true, alive: true };

export type Marker =
  | { key: string; type: "poi"; kind: PoiKind; label: string; ax: number; ay: number; priority: number; showLabel: boolean; poi: AtlasPoi; faction?: string }
  | { key: string; type: "map"; label: string; ax: number; ay: number; priority: number; map: AtlasMap; capital: boolean; faction?: string; size: "world" | "continent" | "zone" }
  | { key: string; type: "event"; label: string; ax: number; ay: number; priority: number; event: AtlasEvent; current: boolean };

const MIN_WIDTH: Record<PoiKind, number> = { capital: 180, city: 640, town: 1000, dungeon: 520, raid: 420, delve: 900, flight: 1200, portal: 900, "zone-label": 240 };
const PRIORITY: Record<PoiKind, number> = { capital: 1, "zone-label": 2, raid: 3, city: 3, dungeon: 4, delve: 5, town: 5, portal: 6, flight: 7 };
const LAYER: Record<PoiKind, keyof Layers> = { capital: "cities", city: "cities", town: "cities", dungeon: "instances", raid: "instances", delve: "instances", flight: "flight", portal: "portals", "zone-label": "labels" };

export type MarkerIndex = {
  poisByMap: Map<number, AtlasPoi[]>;
  eventsByMap: Map<number, AtlasEvent[]>;
  capitals: Map<string, AtlasPoi>;
  byId: Map<number, AtlasMap>;
};

export function indexMarkers(bundle: AtlasBundle): MarkerIndex {
  const poisByMap = new Map<number, AtlasPoi[]>();
  for (const poi of bundle.pois) poisByMap.set(poi.map, [...(poisByMap.get(poi.map) ?? []), poi]);
  const eventsByMap = new Map<number, AtlasEvent[]>();
  for (const event of bundle.events) eventsByMap.set(event.map, [...(eventsByMap.get(event.map) ?? []), event]);
  const capitals = new Map<string, AtlasPoi>();
  for (const poi of bundle.pois) if (poi.kind === "capital" || poi.kind === "city") capitals.set(poi.name, poi);
  return { poisByMap, eventsByMap, capitals, byId: new Map(bundle.maps.map((map) => [map.id, map])) };
}

const point = (map: AtlasMap, x: number, y: number): [number, number] =>
  [map.frame[0] + x * (map.frame[2] - map.frame[0]), map.frame[1] + y * (map.frame[3] - map.frame[1])];

export function pickMarkers(info: FrameInfo, index: MarkerIndex, layers: Layers, era: AtlasEra | null, project: (x: number, y: number) => [number, number], artIn: (map: AtlasMap) => unknown): Array<Marker & { sx: number; sy: number }> {
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
    for (const poi of index.poisByMap.get(map.id) ?? []) {
      if (!layers[LAYER[poi.kind]] || width < MIN_WIDTH[poi.kind]) continue;
      if (poi.kind === "zone-label" && width > 3600) continue;
      const [ax, ay] = point(map, poi.x, poi.y);
      if (poi.kind !== "zone-label" && openKid(ax, ay)) continue;
      if (poi.kind === "zone-label") labelled.add(poi.name);
      const showLabel = poi.kind === "capital" || poi.kind === "city" || poi.kind === "zone-label" || (poi.kind === "town" && width > 1400) || ((poi.kind === "raid" || poi.kind === "dungeon") && width > 1500);
      out.push({ key: `p${poi.id}`, type: "poi", kind: poi.kind, label: poi.name, ax, ay, priority: PRIORITY[poi.kind], showLabel, poi, faction: poi.faction });
    }
    // Names of child maps not opened yet: click to fly in.
    if (layers.labels && width >= 240) {
      for (const child of kids) {
        if ((drawnAlpha.get(child.id) ?? 0) > 0.6 || labelled.has(child.name)) continue;
        const [x0] = project(child.box[0], child.box[1]);
        const [x1] = project(child.box[2], child.box[3]);
        if (x1 - x0 < 46) continue;
        const capital = index.capitals.get(child.name);
        if (capital && !layers.cities) continue;
        const cx = (child.box[0] + child.box[2]) / 2, cy = (child.box[1] + child.box[3]) / 2;
        out.push({
          key: `m${child.id}`, type: "map", label: child.name, ax: cx, ay: cy, priority: capital ? 1 : map.type === "world" || map.type === "cosmic" ? 0 : 2,
          map: child, capital: Boolean(capital), faction: capital?.faction, size: map.type === "cosmic" || map.type === "world" ? "world" : map.type === "continent" ? "continent" : "zone",
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
  // Project, cull, then place the most important first without overlaps.
  const placed: Array<Marker & { sx: number; sy: number }> = [];
  const boxes: Array<[number, number, number, number]> = [];
  const sorted = out.map((marker) => {
    const [sx, sy] = project(marker.ax, marker.ay);
    return { ...marker, sx, sy };
  }).filter((marker) => marker.sx > -40 && marker.sy > -40 && marker.sx < info.width + 40 && marker.sy < info.height + 40)
    .sort((a, b) => a.priority - b.priority);
  for (const marker of sorted) {
    const text = marker.type === "map" || (marker.type === "poi" && marker.showLabel) ? marker.label.length * (marker.type === "map" && marker.size !== "zone" ? 9.5 : 7.4) : 0;
    const icon = marker.type === "map" ? 0 : 26;
    const w = Math.max(icon, text + (icon ? 8 : 0)), h = marker.type === "map" ? 22 : 26;
    const box: [number, number, number, number] = [marker.sx - w / 2, marker.sy - h / 2, marker.sx + w / 2, marker.sy + h / 2 + (text && icon ? 16 : 0)];
    if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    boxes.push(box);
    placed.push(marker);
    if (placed.length >= 140) break;
  }
  return placed;
}
