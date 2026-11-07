/**
 * The world map data contract (apps/web/data/wow/map/*.json), written by the
 * map data pipeline and read by the /wow/map viewer. Client-safe types only.
 *
 * Tiles: level z = 0 is the whole picture in one tile, z = maxZoom is the
 * native size `width × height`; a level is ceil(width / 2^(maxZoom − z)) wide.
 * `url` has {id} {z} {x} {y} placeholders; edge tiles may be smaller than
 * `tileSize` (the viewer reads the size from the decoded image).
 */
export type Words = { en: string; ru: string };
export type MapType = "cosmic" | "world" | "continent" | "zone" | "dungeon" | "micro" | "orphan";
export type MapArt = { width: number; height: number; tileSize: number; maxZoom: number; url: string };
/** [x0, y0, x1, y1], 0..1 in the parent's picture. */
export type Rect = [number, number, number, number];

export type MapRecord = {
  id: number;
  slug: string;
  name: Words;
  type: MapType;
  parentId: number | null;
  children: number[];
  rectInParent: Rect | null;
  art: MapArt | null;
};

export type PoiKind = "capital" | "city" | "town" | "flight" | "portal" | "dungeon" | "raid" | "delve" | "zone-label";
export type PoiRecord = {
  id: string | number;
  mapId: number;
  kind: PoiKind;
  name: Words;
  x: number;
  y: number;
  faction?: "alliance" | "horde" | "neutral";
  href?: string;
  /** Flight masters this one connects to (ids of other `flight` POIs), when the data has them. */
  routes?: Array<string | number>;
};

/** Per-era picture of a map: other art, the current art, or absent in that era. */
export type EraMapOverride = MapArt | "unchanged" | null | { art?: MapArt | null; rectInParent?: Rect };
export type EraRecord = {
  id: string;
  name: Words;
  expansion: string;
  patchRange: [string, string];
  source: { product: "wow" | "wow_classic" | "wow_classic_era"; build: string };
  maps: Record<string, EraMapOverride>;
};

export type EventLink = { href: string; label?: Words };
export type EventRecord = {
  id: string;
  eraId: string;
  patch: string;
  year?: number;
  title: Words;
  summary: Words;
  mapId: number;
  x: number;
  y: number;
  beforeEraId?: string;
  afterEraId?: string;
  links?: Array<EventLink | string>;
};

export type WorldMapData = { maps: MapRecord[]; pois: PoiRecord[]; eras: EraRecord[]; events: EventRecord[] };
