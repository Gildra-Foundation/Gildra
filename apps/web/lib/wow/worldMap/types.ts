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
export type MapArt = {
  width: number; height: number; tileSize: number; maxZoom: number; url: string;
  /** The same picture from the Russian client (names painted in Russian), same tiling. */
  urlRu?: string;
  /** The picture names its places itself (where the EN and RU pictures differ). */
  namesPainted?: boolean;
  /** Boxes of the painted words, 0..1 of the picture; an object names the map it labels. */
  paintedLabels?: Array<Rect | { box?: Rect; rect?: Rect; labelFor?: number | string | null }>;
  /** Frames, crests and corner pieces painted into the picture, same forms. */
  decor?: Array<Rect | { box?: Rect; rect?: Rect; labelFor?: number | string | null }>;
};
/** [x0, y0, x1, y1], 0..1 in the parent's picture. */
export type Rect = [number, number, number, number];
/**
 * Deep-zoom ground of a continent (the client's minimap textures): a tile
 * pyramid like `MapArt` ({z} {x} {y} placeholders), placed by `rect` in the
 * continent's 0..1 picture space (may exceed 0..1).
 */
export type MapTerrain = {
  url: string; tileSize: number; width: number; height: number; maxZoom: number; rect: Rect;
  /** JSON {z: ["x_y", …]} of the tiles that exist (open sea has none): only those are requested. */
  index?: string;
  /** JSON {z: ["x_y", …]} of the tiles that do NOT exist (the complement of `index`; used when there is no index). */
  empty?: string;
  /** "#rrggbb": the sea filled under the tiles inside its rect (where no tile exists or a tile is see-through). */
  ocean?: string;
};

export type MapRecord = {
  id: number;
  slug: string;
  name: Words;
  type: MapType;
  parentId: number | null;
  children: number[];
  rectInParent: Rect | null;
  art: MapArt | null;
  /** The map's own area (white) inside its art: a single-channel picture of the art's aspect. */
  mask?: string;
  terrain?: MapTerrain;
  /** Another map of the same place (a phase, a later or earlier picture): the place's main map id. */
  samePlaceAs?: number;
  placeRole?: "floor" | "phase" | "successor" | "predecessor" | "alternate" | "aggregate";
  /** The patches this picture of the place stands for (phases, successors, predecessors). */
  activeFrom?: string;
  activeTo?: string;
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
  /** The map this point opens (a capital's own city map). */
  targetMapId?: number;
};

/** Per-era picture of a map: other art, the current art, or absent in that era. */
export type EraMapOverride = MapArt | "unchanged" | null | {
  art?: MapArt | null; rectInParent?: Rect | null; name?: Words; parentId?: number | string | null; children?: Array<number | string>;
  mask?: string | null; terrain?: MapTerrain | null;
  /** The map did not exist in that era (nor its points). */
  absent?: boolean;
} | MapRecord;
export type PatchRange = [string, string] | { from: string; to: string | null };
/** An era of the art (eras.json): the game's maps as a client of that time drew them. */
export type EraRecord = {
  id: string;
  name: Words;
  expansion: string;
  patchRange: PatchRange;
  source?: { product: string; build: string };
  maps?: Record<string, EraMapOverride>;
  /** A phase of a few maps inside the parent era's time. */
  inherits?: string;
  rootMapId?: number;
  /** That client's points (replace the current ones). */
  pois?: PoiRecord[];
  /** Maps another map of the same place stands for at the era's start: not drawn, nor their points. */
  inactive?: number[];
};
/** An era of the timeline (eras-meta.json): one per expansion. */
export type EraMeta = {
  id: string;
  name: Words;
  expansion: string;
  patchRange: PatchRange;
  years?: { from: number; to: number | null };
  accent?: string;
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
  kind?: string;
  changedMapIds?: number[];
};

export type WorldMapData = { maps: MapRecord[]; pois: PoiRecord[]; eras: EraRecord[]; eraMeta?: EraMeta[]; events: EventRecord[] };
