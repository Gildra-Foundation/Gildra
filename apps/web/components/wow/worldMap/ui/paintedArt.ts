import type { AtlasMap } from "@/lib/wow/worldMap/bundle";

/**
 * What the game painted into a map's own picture: the big title of the
 * continent and the names of the seas ([x0, y0, x1, y1], 0..1 of the art),
 * and whether the zones are already named on it. Labels keep clear of the
 * painted words; on art that names its zones our names show on hover only.
 * Keyed by the art URL: an older client's picture of the same map differs.
 */
type Painted = { titles: Array<[number, number, number, number]>; names: boolean };

const PAINTED: Record<string, Painted> = {
  "/maps/tiles/12/": { names: false, titles: [[0.385, 0.435, 0.6, 0.51], [0.115, 0.315, 0.215, 0.435], [0.73, 0.56, 0.825, 0.685]] },
  "/maps/tiles/13/": { names: false, titles: [[0.345, 0.595, 0.63, 0.735], [0.205, 0.34, 0.295, 0.465], [0.705, 0.465, 0.865, 0.595]] },
  "/maps/tiles/101/": { names: true, titles: [[0.105, 0.845, 0.395, 0.95]] },
  "/maps/tiles/113/": { names: true, titles: [[0.22, 0.845, 0.57, 0.95]] },
  "/maps/tiles/424/": { names: true, titles: [[0.095, 0.875, 0.425, 0.96]] },
  "/maps/tiles/572/": { names: true, titles: [] },
  "/maps/tiles/619/": { names: true, titles: [[0.685, 0.805, 0.93, 0.94]] },
  "/maps/tiles/875/": { names: true, titles: [[0.025, 0.705, 0.31, 0.795]] },
  "/maps/tiles/876/": { names: true, titles: [[0.14, 0.045, 0.43, 0.13]] },
  "/maps/tiles/905/": { names: true, titles: [[0.095, 0.795, 0.35, 0.88]] },
  "/maps/tiles/948/": { names: true, titles: [] },
  "/maps/tiles/1550/": { names: true, titles: [[0.03, 0.815, 0.37, 0.92]] },
  "/maps/tiles/1978/": { names: true, titles: [[0.135, 0.08, 0.385, 0.205]] },
  "/maps/tiles/2274/": { names: true, titles: [[0.075, 0.74, 0.265, 0.87]] },
  "/maps/tiles/2537/": { names: true, titles: [] },
};

/**
 * The data names the painted words of every picture that has a Russian
 * version (where the EN and RU pictures differ); the hand table covers the
 * rest and says whether a continent's words are its zones' names.
 */
export function paintedOf(map: AtlasMap): Painted | null {
  const art = map.art;
  if (!art?.url) return null;
  const at = art.url.indexOf("{z}");
  const key = (at > 0 ? art.url.slice(0, at) : art.url).replace("/maps/tiles/ru/", "/maps/tiles/");
  const table = PAINTED[key];
  if (art.paintedLabels?.length) {
    // A continent's painted words may be only its title and seas (Kalimdor): the table knows; zones and cities name their places.
    const names = table ? table.names : Boolean(art.namesPainted) && map.type !== "continent";
    return { titles: art.paintedLabels, names };
  }
  return table ?? null;
}

/** The painted words of a map in atlas space. */
export function paintedBoxes(map: AtlasMap): Array<[number, number, number, number]> {
  const painted = paintedOf(map);
  if (!painted?.titles.length) return [];
  const [fx0, fy0, fx1, fy1] = map.frame;
  const w = fx1 - fx0, h = fy1 - fy0;
  return painted.titles.map(([x0, y0, x1, y1]) => [fx0 + x0 * w, fy0 + y0 * h, fx0 + x1 * w, fy0 + y1 * h]);
}
