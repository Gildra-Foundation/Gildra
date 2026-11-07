import type { EraMapOverride, EventLink, MapArt, MapRecord, MapType, PatchRange, PoiKind, Rect, WorldMapData } from "./types";

/**
 * The viewer's compact bundle of the world map, for one language. Every map
 * gets its box in one shared "atlas space": the top map of each hierarchy
 * (normally Cosmic) spans x 0..1 and y 0..height/width; children are placed by
 * composing their rectInParent; maps that hang nowhere are laid out side by
 * side, far apart, so one camera can travel between all of them.
 */
export type Lang = "en" | "ru";
export type AtlasMap = {
  id: number;
  slug: string;
  type: MapType;
  name: string;
  parent: number | null;
  children: number[];
  /** Box in atlas space (from the parent's rect). */
  box: Rect;
  /** Where the art is drawn: the box, or the art fitted inside it when the aspect differs (worlds on the Cosmic map). */
  frame: Rect;
  art: MapArt | null;
  depth: number;
  /** The map has its own indexable page. */
  page: boolean;
  /** Shown inside a round "portal" while it fades in (worlds on the Cosmic map). */
  portal: boolean;
};
export type AtlasPoi = { id: string; map: number; kind: PoiKind; name: string; x: number; y: number; faction?: "alliance" | "horde" | "neutral"; href?: string; routes?: string[]; target?: number };
export type AtlasEra = { id: string; name: string; expansion: string; range: [string, string]; years?: [number, number]; accent?: string; maps: Record<number, MapArt | null> };
export type AtlasEvent = {
  id: string; era: string; patch: string; year?: number; title: string; summary: string;
  /** null: the place is not on the map yet (the event still sits on the timeline). */
  map: number | null; x: number; y: number; before?: string; after?: string; links: Array<{ href: string; label?: string }>;
  changed?: number[];
};
export type AtlasBundle = { lang: Lang; maps: AtlasMap[]; pois: AtlasPoi[]; eras: AtlasEra[]; events: AtlasEvent[] };

const ROOT_GAP = 3;
const DRAWN: ReadonlySet<MapType> = new Set(["cosmic", "world", "continent", "zone", "micro", "orphan"]);
const PAGED: ReadonlySet<MapType> = new Set(["world", "continent", "zone"]);

function validArt(art: MapArt | null | undefined): art is MapArt {
  return Boolean(art && art.width > 0 && art.height > 0 && art.tileSize > 0 && art.maxZoom >= 0 && typeof art.url === "string");
}
const validRect = (rect: Rect | null | undefined): rect is Rect =>
  Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite) && rect[2] > rect[0] && rect[3] > rect[1];

/** The art fitted into a box, centred, when their aspect ratios differ by more than 4%. */
function fitFrame(box: Rect, art: MapArt | null): Rect {
  if (!art) return box;
  const bw = box[2] - box[0], bh = box[3] - box[1];
  const aspect = art.width / art.height;
  if (Math.abs(bw / bh / aspect - 1) < 0.04) return box;
  const w = Math.min(bw, bh * aspect), h = w / aspect;
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

/** An era's art for a map: other art, `null` when the map did not exist then, `undefined` when it is the current art. */
export function eraArt(override: EraMapOverride): MapArt | null | undefined {
  if (override === "unchanged") return undefined;
  if (override === null) return null;
  if (typeof override === "object" && "url" in override) return validArt(override) ? override : undefined;
  if (typeof override === "object" && "art" in override) return override.art === null ? null : validArt(override.art) ? override.art : undefined;
  return undefined;
}

export function buildAtlasBundle(data: WorldMapData, lang: Lang): AtlasBundle {
  const records = new Map<number, MapRecord>();
  for (const map of data.maps) if (DRAWN.has(map.type) && validArt(map.art)) records.set(map.id, map);

  const placed = new Map<number, AtlasMap>();
  const place = (record: MapRecord, box: Rect, depth: number, portal: boolean) => {
    const frame = fitFrame(box, record.art);
    const node: AtlasMap = {
      id: record.id, slug: record.slug, type: record.type, name: record.name[lang] || record.name.en,
      parent: depth === 0 ? null : record.parentId, children: [], box, frame, art: record.art, depth,
      page: false, portal,
    };
    placed.set(record.id, node);
    for (const childId of record.children) {
      const child = records.get(childId);
      if (!child || placed.has(childId) || child.parentId !== record.id || !validRect(child.rectInParent)) continue;
      const [x0, y0, x1, y1] = child.rectInParent;
      const w = frame[2] - frame[0], h = frame[3] - frame[1];
      const childBox: Rect = [frame[0] + x0 * w, frame[1] + y0 * h, frame[0] + x1 * w, frame[1] + y1 * h];
      node.children.push(childId);
      place(child, childBox, depth + 1, record.type === "cosmic");
    }
  };

  // Tops first: the Cosmic map, then worlds, continents… that hang nowhere.
  const order: MapType[] = ["cosmic", "world", "continent", "zone", "micro", "orphan"];
  const tops = [...records.values()]
    .filter((map) => map.parentId === null || !records.has(map.parentId) || !validRect(map.rectInParent))
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.id - b.id);
  let offset = 0;
  for (const top of tops) {
    if (placed.has(top.id)) continue;
    const art = top.art as MapArt;
    place(top, [offset, 0, offset + 1, art.height / art.width], 0, false);
    offset += 1 + ROOT_GAP;
  }
  // A map listed by a parent that is not placed (a cycle or a missing rect) becomes its own top.
  for (const record of records.values()) {
    if (placed.has(record.id)) continue;
    const art = record.art as MapArt;
    place(record, [offset, 0, offset + 1, art.height / art.width], 0, false);
    offset += 1 + ROOT_GAP;
  }

  const cosmic = [...placed.values()].find((map) => map.type === "cosmic" && map.depth === 0);
  const chainTop = (map: AtlasMap) => { let m = map; while (m.parent !== null) m = placed.get(m.parent) as AtlasMap; return m; };
  for (const map of placed.values()) {
    const top = chainTop(map);
    map.page = PAGED.has(map.type) && (!cosmic || top.id === cosmic.id || top.type === "world");
  }

  const maps = [...placed.values()].sort((a, b) => a.depth - b.depth || a.id - b.id);
  const pois = data.pois
    .filter((poi) => placed.has(poi.mapId) && Number.isFinite(poi.x) && Number.isFinite(poi.y))
    .map((poi) => ({
      id: String(poi.id), map: poi.mapId, kind: poi.kind, name: poi.name[lang] || poi.name.en, x: poi.x, y: poi.y,
      ...(poi.faction ? { faction: poi.faction } : {}),
      ...(poi.href ? { href: poi.href } : {}),
      ...(poi.routes?.length ? { routes: poi.routes.map(String) } : {}),
      ...(poi.targetMapId && placed.has(poi.targetMapId) ? { target: poi.targetMapId } : {}),
    }));
  // Timeline eras (one per expansion, eras-meta.json) take their art from the art
  // eras (eras.json) of the same id, else from the latest art era that began before.
  const overridesOf = (maps: Record<string, EraMapOverride> | undefined) => {
    const out: Record<number, MapArt | null> = {};
    for (const [key, value] of Object.entries(maps ?? {})) {
      const id = Number(key);
      if (!placed.has(id)) continue;
      const art = eraArt(value);
      if (art !== undefined) out[id] = art;
    }
    return out;
  };
  const artEras = (data.eras ?? []).map((era) => ({ era, range: rangeOf(era.patchRange), maps: overridesOf(era.maps) }));
  const timeline = data.eraMeta?.length ? data.eraMeta : data.eras ?? [];
  const eras: AtlasEra[] = timeline.map((era) => {
    const range = rangeOf(era.patchRange);
    const art = artEras.find((entry) => entry.era.id === era.id)
      ?? artEras.filter((entry) => comparePatch(entry.range[0], range[0]) <= 0).sort((a, b) => comparePatch(b.range[0], a.range[0]))[0];
    const years = "years" in era && era.years?.from ? [era.years.from, era.years.to ?? era.years.from] as [number, number] : undefined;
    const accent = "accent" in era && typeof era.accent === "string" && /^#[0-9a-f]{6}$/i.test(era.accent) ? era.accent : undefined;
    return { id: era.id, name: era.name[lang] || era.name.en, expansion: era.expansion, range, ...(years ? { years } : {}), ...(accent ? { accent } : {}), maps: art?.maps ?? {} };
  });
  const eraIds = new Set(eras.map((era) => era.id));
  const events = data.events
    .filter((event) => eraIds.has(event.eraId))
    .map((event) => ({
      id: event.id, era: event.eraId, patch: event.patch, ...(event.year ? { year: event.year } : {}),
      title: event.title[lang] || event.title.en, summary: event.summary[lang] || event.summary.en,
      map: placed.has(event.mapId) ? event.mapId : null, x: event.x, y: event.y,
      ...(event.changedMapIds?.length ? { changed: event.changedMapIds } : {}),
      ...(event.beforeEraId && eraIds.has(event.beforeEraId) ? { before: event.beforeEraId } : {}),
      ...(event.afterEraId && eraIds.has(event.afterEraId) ? { after: event.afterEraId } : {}),
      links: (event.links ?? []).map((link: EventLink | string) => typeof link === "string" ? { href: link } : { href: link.href, ...(link.label ? { label: link.label[lang] || link.label.en } : {}) })
        .filter((link) => link.href.startsWith("/")),
    }))
    .sort((a, b) => comparePatch(a.patch, b.patch));
  return { lang, maps, pois, eras, events };
}

/** A patch range as [from, to]; an open range (the current expansion) ends with its own major version. */
export function rangeOf(range: PatchRange): [string, string] {
  const [from, to] = Array.isArray(range) ? range : [range.from, range.to];
  const start = from || "1.0.0";
  return [start, to || `${patchParts(start)[0]}.9.9`];
}

/** "5.4.0" → [5, 4, 0]. */
export function patchParts(patch: string) {
  return patch.split(".").map((part) => Number.parseInt(part, 10) || 0);
}
export function comparePatch(a: string, b: string) {
  const pa = patchParts(a), pb = patchParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Deep link of a map page: /wow/map/85-orgrimmar. */
export const mapPagePath = (map: { id: number; slug: string }) => `/wow/map/${map.id}-${map.slug}`;
export const mapPageParam = (map: { id: number; slug: string }) => `${map.id}-${map.slug}`;
