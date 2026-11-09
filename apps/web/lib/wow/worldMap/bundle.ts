import type { EraMapOverride, EraRecord, EventLink, MapArt, MapRecord, MapTerrain, MapType, PatchRange, PoiKind, PoiRecord, Rect, WorldMapData } from "./types";

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
  art: AtlasArt | null;
  depth: number;
  /** The map has its own indexable page. */
  page: boolean;
  /** Shown inside a round "portal" while it fades in (worlds on the Cosmic map). */
  portal: boolean;
  /** The map's own area inside its art (white): the rest shows the maps around it. */
  mask?: string;
  /** Deep-zoom ground of a continent, with its box in atlas space. */
  terrain?: AtlasTerrain;
  /** The main map of the place this one is another picture of (phases, earlier/later pictures). */
  samePlace?: number;
  placeRole?: MapRecord["placeRole"];
  /** The patches this picture of the place stands for. */
  activeFrom?: string;
  activeTo?: string;
};
export type AtlasTerrain = { art: MapArt; frame: Rect; index?: string; empty?: string; ocean?: string };
/** A map's picture in the bundle's language: `localized` when its painted words are in that language. */
export type AtlasArt = Omit<MapArt, "urlRu"> & { localized?: boolean };
export type AtlasPoi = { id: string; map: number; kind: PoiKind; name: string; x: number; y: number; faction?: "alliance" | "horde" | "neutral"; href?: string; routes?: string[]; target?: number };
/** An era of the timeline (one per expansion). */
export type AtlasEra = { id: string; name: string; expansion: string; range: [string, string]; years?: [number, number]; accent?: string };
/**
 * The maps as one game client drew them (eras.json): `only` = the base maps that
 * exist then unchanged (null: all), `own` = maps placed or drawn differently
 * (other art, other place, era-only maps), `pois` = that client's points (null:
 * the base points of the maps that exist). A variant (`inherits`) is a phase of
 * a few maps inside its parent's time (Theramore after its fall).
 */
export type ArtEra = { id: string; name: string; range: [string, string]; inherits?: string; product: string; only: number[] | null; own: AtlasMap[]; pois: AtlasPoi[] | null; inactive?: number[] };
/** What the main bundle says about an art era; the maps come on demand (atlas/<lang>/<era>). */
export type ArtEraInfo = { id: string; name: string; range: [string, string]; inherits?: string; changed: number[]; inactive?: number[] };
export type AtlasEvent = {
  id: string; era: string; patch: string; year?: number; title: string; summary: string;
  /** null: the place is not on the map yet (the event still sits on the timeline). */
  map: number | null; x: number; y: number; before?: string; after?: string; links: Array<{ href: string; label?: string }>;
  changed?: number[];
  kind?: string;
};
export type AtlasBundle = { lang: Lang; maps: AtlasMap[]; pois: AtlasPoi[]; eras: AtlasEra[]; art: ArtEraInfo[]; events: AtlasEvent[] };

const ROOT_GAP = 3;
const DRAWN: ReadonlySet<MapType> = new Set(["cosmic", "world", "continent", "zone", "micro", "orphan"]);
const PAGED: ReadonlySet<MapType> = new Set(["world", "continent", "zone"]);

function validArt(art: MapArt | null | undefined): art is MapArt {
  return Boolean(art && art.width > 0 && art.height > 0 && art.tileSize > 0 && art.maxZoom >= 0 && typeof art.url === "string");
}
const validRect = (rect: Rect | null | undefined): rect is Rect =>
  Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite) && rect[2] > rect[0] && rect[3] > rect[1];
const validMask = (mask: unknown): mask is string => typeof mask === "string" && mask.startsWith("/");
const validTerrain = (terrain: MapTerrain | null | undefined): terrain is MapTerrain =>
  Boolean(terrain && validArt(terrain) && validRect(terrain.rect));
/** A terrain's box in atlas space: its rect inside the map's frame. */
function terrainOf(record: MapRecord, frame: Rect): AtlasTerrain | undefined {
  const t = record.terrain;
  if (!validTerrain(t)) return undefined;
  const w = frame[2] - frame[0], h = frame[3] - frame[1];
  const [x0, y0, x1, y1] = t.rect;
  return {
    art: { width: t.width, height: t.height, tileSize: t.tileSize, maxZoom: t.maxZoom, url: t.url },
    frame: [frame[0] + x0 * w, frame[1] + y0 * h, frame[0] + x1 * w, frame[1] + y1 * h],
    ...(typeof t.index === "string" && t.index.startsWith("/") ? { index: t.index } : {}),
    ...(typeof t.empty === "string" && t.empty.startsWith("/") ? { empty: t.empty } : {}),
    ...(typeof t.ocean === "string" && /^#[0-9a-f]{6}$/i.test(t.ocean) ? { ocean: t.ocean } : {}),
  };
}

/** The picture for a language: the Russian client's own picture on /ru when there is one. */
export function localArt(art: MapArt, lang: Lang): AtlasArt {
  const { urlRu, ...rest } = art;
  const ru = lang === "ru" && typeof urlRu === "string" && urlRu.startsWith("/");
  return { ...rest, url: ru ? urlRu : art.url, ...(lang === "en" || ru ? { localized: true } : {}) };
}

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

/**
 * Places a set of maps in atlas space. Children hang by parentId + rectInParent;
 * `anchors` give fixed frames to tops that exist elsewhere (an era's Azeroth sits
 * where the current Azeroth sits, so the camera keeps its place across eras).
 */
function placeRecords(records: Map<number, MapRecord>, lang: Lang, anchors: Map<number, AtlasMap> | null, firstOffset: number, era?: { root: number | null; explicit: ReadonlySet<number>; tops: ReadonlySet<number> }) {
  const usable = new Map<number, MapRecord>();
  for (const [id, map] of records) if (DRAWN.has(map.type) && validArt(map.art)) usable.set(id, map);
  const kids = new Map<number, number[]>();
  for (const map of usable.values()) {
    if (map.parentId === null || !usable.has(map.parentId) || !validRect(map.rectInParent)) continue;
    // An era that lists a parent's children says which maps hang there (the others did not then).
    if (era?.explicit.has(map.parentId) && !(usable.get(map.parentId) as MapRecord).children.includes(map.id)) continue;
    kids.set(map.parentId, [...(kids.get(map.parentId) ?? []), map.id]);
  }
  const placed = new Map<number, AtlasMap>();
  const place = (record: MapRecord, box: Rect, depth: number, portal: boolean, frameOverride?: Rect) => {
    const frame = frameOverride ?? fitFrame(box, record.art);
    const node: AtlasMap = {
      id: record.id, slug: record.slug, type: record.type, name: record.name[lang] || record.name.en,
      parent: depth === 0 ? null : record.parentId, children: [], box, frame, art: record.art ? localArt(record.art, lang) : null, depth,
      page: false, portal,
      ...(validMask(record.mask) ? { mask: record.mask } : {}),
      ...(typeof record.samePlaceAs === "number" && record.samePlaceAs !== record.id ? { samePlace: record.samePlaceAs } : {}),
      ...(record.placeRole ? { placeRole: record.placeRole } : {}),
      ...(typeof record.activeFrom === "string" ? { activeFrom: record.activeFrom } : {}),
      ...(typeof record.activeTo === "string" ? { activeTo: record.activeTo } : {}),
    };
    const terrain = terrainOf(record, frame);
    if (terrain) node.terrain = terrain;
    placed.set(record.id, node);
    for (const childId of (kids.get(record.id) ?? []).sort((x, y) => x - y)) {
      const child = usable.get(childId) as MapRecord;
      if (placed.has(childId)) continue;
      const [x0, y0, x1, y1] = child.rectInParent as Rect;
      const w = frame[2] - frame[0], h = frame[3] - frame[1];
      node.children.push(childId);
      place(child, [frame[0] + x0 * w, frame[1] + y0 * h, frame[0] + x1 * w, frame[1] + y1 * h], depth + 1, record.type === "cosmic");
    }
  };
  // Tops first: the Cosmic map, then worlds, continents… that hang nowhere.
  const order: MapType[] = ["cosmic", "world", "continent", "zone", "micro", "orphan"];
  const tops = [...usable.values()]
    .filter((map) => map.parentId === null || !usable.has(map.parentId) || !validRect(map.rectInParent))
    .sort((x, y) => order.indexOf(x.type) - order.indexOf(y.type) || x.id - y.id);
  let offset = firstOffset;
  for (const top of [...tops, ...usable.values()]) {
    if (placed.has(top.id)) continue;
    // An era has its root and the worlds its Cosmic picture had no place for (Draenor in Warlords):
    // those stand apart as roots of their own. A map whose parent did not exist then did not exist either.
    if (era && era.root !== null && top.id !== era.root && !era.tops.has(top.id)) continue;
    const anchor = era && top.id !== era.root ? undefined : anchors?.get(top.id);
    if (anchor) { place(top, anchor.box, 0, false, anchor.frame); continue; }
    const art = top.art as MapArt;
    place(top, [offset, 0, offset + 1, art.height / art.width], 0, false);
    offset += 1 + ROOT_GAP;
  }
  return placed;
}

function toPoi(poi: PoiRecord, lang: Lang, mapId: number, target: number | undefined) {
  return {
    id: String(poi.id), map: mapId, kind: poi.kind, name: poi.name[lang] || poi.name.en, x: poi.x, y: poi.y,
    ...(poi.faction ? { faction: poi.faction } : {}),
    ...(poi.href ? { href: poi.href } : {}),
    ...(poi.routes?.length ? { routes: poi.routes.map(String) } : {}),
    ...(target !== undefined ? { target } : {}),
  } satisfies AtlasPoi;
}

const sameNode = (a: AtlasMap, b: AtlasMap) =>
  a.parent === b.parent && a.depth === b.depth && a.portal === b.portal && a.name === b.name && a.art?.url === b.art?.url
  && a.mask === b.mask && a.terrain?.art.url === b.terrain?.art.url
  && a.frame.every((v, i) => Math.abs(v - b.frame[i]) < 1e-9) && a.children.length === b.children.length && a.children.every((id, i) => b.children[i] === id);

export function buildAtlasBundle(data: WorldMapData, lang: Lang): AtlasBundle & { artEras: ArtEra[] } {
  const retail = new Map<number, MapRecord>();
  for (const map of data.maps) retail.set(map.id, map);
  const placed = placeRecords(retail, lang, null, 0);
  const cosmic = [...placed.values()].find((map) => map.type === "cosmic" && map.depth === 0);
  const chainTop = (map: AtlasMap) => { let m = map; while (m.parent !== null) m = placed.get(m.parent) as AtlasMap; return m; };
  for (const map of placed.values()) {
    const top = chainTop(map);
    map.page = PAGED.has(map.type) && (!cosmic || top.id === cosmic.id || top.type === "world");
  }
  const maps = [...placed.values()].sort((a, b) => a.depth - b.depth || a.id - b.id);
  const pois = data.pois
    .filter((poi) => placed.has(poi.mapId) && Number.isFinite(poi.x) && Number.isFinite(poi.y))
    .map((poi) => toPoi(poi, lang, poi.mapId, poi.targetMapId && placed.has(poi.targetMapId) ? poi.targetMapId : undefined));

  const art = buildArtEras(data.eras ?? [], retail, placed, lang);
  const timeline = data.eraMeta?.length ? data.eraMeta : (data.eras ?? []).filter((era) => !("inherits" in era && era.inherits));
  const eras: AtlasEra[] = timeline.map((era) => {
    const range = rangeOf(era.patchRange);
    const years = "years" in era && era.years?.from ? [era.years.from, era.years.to ?? era.years.from] as [number, number] : undefined;
    const accent = "accent" in era && typeof era.accent === "string" && /^#[0-9a-f]{6}$/i.test(era.accent) ? era.accent : undefined;
    return { id: era.id, name: era.name[lang] || era.name.en, expansion: era.expansion, range, ...(years ? { years } : {}), ...(accent ? { accent } : {}) };
  }).sort((a, b) => comparePatch(a.range[0], b.range[0]));
  const eraIds = new Set(eras.map((era) => era.id));
  const events = data.events
    .filter((event) => eraIds.has(event.eraId))
    .map((event) => ({
      id: event.id, era: event.eraId, patch: event.patch, ...(event.year ? { year: event.year } : {}),
      title: event.title[lang] || event.title.en, summary: event.summary[lang] || event.summary.en,
      map: placed.has(event.mapId) ? event.mapId : null, x: event.x, y: event.y,
      ...(event.changedMapIds?.length ? { changed: event.changedMapIds } : {}),
      ...(event.kind ? { kind: event.kind } : {}),
      ...(event.beforeEraId && eraIds.has(event.beforeEraId) ? { before: event.beforeEraId } : {}),
      ...(event.afterEraId && eraIds.has(event.afterEraId) ? { after: event.afterEraId } : {}),
      links: (event.links ?? []).map((link: EventLink | string) => typeof link === "string" ? { href: link } : { href: link.href, ...(link.label ? { label: link.label[lang] || link.label.en } : {}) })
        .filter((link) => link.href.startsWith("/")),
    }))
    .sort((a, b) => comparePatch(a.patch, b.patch));
  return { lang, maps, pois, eras, art: art.map(({ id, name, range, inherits, own, inactive }) => ({ id, name, range, ...(inherits ? { inherits } : {}), changed: own.map((map) => map.id), ...(inactive?.length ? { inactive } : {}) })), artEras: art, events };
}

/**
 * The art eras: each era's maps resolved (listed = existed; "unchanged" = the
 * current map; an object overrides art, place, name or parent; keys like
 * "classic-1416" are maps of that era only; a variant starts from its parent),
 * placed with its top anchored on the current map of the same id, and kept as
 * the difference from the current maps.
 */
function buildArtEras(eras: EraRecord[], retail: Map<number, MapRecord>, base: Map<number, AtlasMap>, lang: Lang): ArtEra[] {
  const byId = new Map(eras.map((era) => [era.id, era]));
  const extra = new Map<string, number>();
  const idOf = (key: string | number | null | undefined): number | null => {
    if (key === null || key === undefined) return null;
    if (typeof key === "number") return key;
    if (/^\d+$/.test(key)) return Number(key);
    if (!extra.has(key)) extra.set(key, 9_000_000 + extra.size);
    return extra.get(key) as number;
  };
  const resolved = new Map<string, Map<number, MapRecord>>();
  // Parents whose children an era lists itself (then only those hang there).
  const explicitOf = new Map<string, Set<number>>();
  // Maps an era puts at the top on purpose (parentId null): roots of their own.
  const topsOf = new Map<string, Set<number>>();
  const resolve = (era: EraRecord, seen = new Set<string>()): Map<number, MapRecord> => {
    const done = resolved.get(era.id);
    if (done) return done;
    const parent = "inherits" in era && typeof era.inherits === "string" ? byId.get(era.inherits) : undefined;
    const nodes = parent && !seen.has(parent.id) ? new Map(resolve(parent, new Set([...seen, era.id]))) : new Map<number, MapRecord>();
    const explicit = new Set(parent ? explicitOf.get(parent.id) ?? [] : []);
    explicitOf.set(era.id, explicit);
    const tops = new Set(parent ? topsOf.get(parent.id) ?? [] : []);
    topsOf.set(era.id, tops);
    for (const [key, value] of Object.entries(era.maps ?? {})) {
      const id = idOf(key) as number;
      if (value === "unchanged") { const r = retail.get(id); if (r) nodes.set(id, r); continue; }
      if (value === null) { nodes.delete(id); continue; }
      if (typeof value !== "object") continue;
      const current = nodes.get(id) ?? retail.get(id);
      const o = value as Record<string, unknown>;
      if (o.absent === true) { nodes.delete(id); continue; }
      if ("url" in o) {
        if (!current) continue;
        // Other art: the current mask and ground do not fit it.
        const { mask: _mask, terrain: _terrain, ...rest } = current;
        void _mask; void _terrain;
        nodes.set(id, validArt(o as MapArt) ? { ...rest, art: o as MapArt } : current);
        continue;
      }
      const node = {
        ...(current ?? { id, slug: String(o.slug ?? key), type: (o.type as MapType) ?? "zone", name: (o.name as MapRecord["name"]) ?? { en: key, ru: key }, parentId: null, children: [], rectInParent: null, art: null }),
        id,
        ...(o.art !== undefined ? { art: validArt(o.art as MapArt) ? (o.art as MapArt) : null } : {}),
        ...(o.rectInParent !== undefined ? { rectInParent: o.rectInParent as Rect | null } : {}),
        ...(o.name ? { name: o.name as MapRecord["name"] } : {}),
        ...(o.parentId !== undefined ? { parentId: idOf(o.parentId as string | number | null) } : {}),
        ...(o.type ? { type: o.type as MapType } : {}),
        ...(Array.isArray(o.children) ? { children: (o.children as Array<string | number>).map(idOf).filter((c): c is number => c !== null) } : {}),
      } as MapRecord;
      // Another picture brings its own mask and ground unless the era names them.
      if (validMask(o.mask)) node.mask = o.mask;
      else if (o.mask !== undefined || o.art !== undefined) delete node.mask;
      if (validTerrain(o.terrain as MapTerrain)) node.terrain = o.terrain as MapTerrain;
      else if (o.terrain !== undefined || o.art !== undefined) delete node.terrain;
      if (Array.isArray(o.children)) explicit.add(id);
      if ("parentId" in o && o.parentId === null) tops.add(id); else tops.delete(id);
      nodes.set(id, node);
    }
    resolved.set(era.id, nodes);
    return nodes;
  };
  const poisOf = (era: EraRecord, placed: Map<number, AtlasMap>): AtlasPoi[] | null => {
    const list = (era as EraRecord & { pois?: PoiRecord[] }).pois;
    if (!list) {
      const parent = "inherits" in era && typeof era.inherits === "string" ? byId.get(era.inherits) : undefined;
      return parent ? poisOf(parent, placed) : null;
    }
    return list
      .map((poi) => ({ poi, map: idOf(poi.mapId as unknown as string), target: idOf(poi.targetMapId as unknown as string) }))
      .filter((entry) => entry.map !== null && placed.has(entry.map) && Number.isFinite(entry.poi.x) && Number.isFinite(entry.poi.y))
      .map((entry) => toPoi(entry.poi, lang, entry.map as number, entry.target !== null && placed.has(entry.target) ? entry.target : undefined));
  };
  const placedOf = new Map<string, Map<number, AtlasMap>>();
  const placeEra = (era: EraRecord) => {
    let done = placedOf.get(era.id);
    if (!done) {
      const records = resolve(era);
      const root = era.rootMapId !== undefined ? idOf(era.rootMapId as number | string) : null;
      done = placeRecords(records, lang, base, 1000, { root: root !== null && records.has(root) ? root : null, explicit: explicitOf.get(era.id) ?? new Set(), tops: topsOf.get(era.id) ?? new Set() });
      placedOf.set(era.id, done);
    }
    return done;
  };
  return eras.map((era) => {
    const placed = placeEra(era);
    const parent = "inherits" in era && typeof era.inherits === "string" ? byId.get(era.inherits) : undefined;
    // A variant keeps only what differs from its parent era (the viewer lays it over the parent).
    const against = parent ? placeEra(parent) : base;
    const own: AtlasMap[] = [];
    const only: number[] = [];
    for (const node of placed.values()) {
      const current = against.get(node.id);
      if (current && sameNode(node, current)) only.push(node.id);
      else own.push({ ...node, page: base.get(node.id)?.page ?? false });
    }
    return {
      id: era.id, name: era.name?.[lang] || era.name?.en || era.id, range: rangeOf(era.patchRange), product: era.source?.product ?? "wow",
      ...(parent ? { inherits: parent.id } : {}),
      only: parent || only.length === base.size ? null : only.sort((x, y) => x - y),
      own,
      pois: parent ? null : poisOf(era, placed),
      ...(Array.isArray(era.inactive) && era.inactive.length ? { inactive: era.inactive.filter((id): id is number => typeof id === "number") } : {}),
    };
  });
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
