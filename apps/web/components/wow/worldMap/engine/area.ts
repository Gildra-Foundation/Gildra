import { clamp } from "./camera";

/**
 * A map's own area as a small grid read off its mask (white = the map's land): whether a point lies in it, and a
 * point well inside it. Rectangles of zones overlap (Azsuna's middle lies in Suramar); the area does not, so the
 * place the reader zooms at — or points at — is the one whose land is there. Pure math, unit-tested; the loader
 * reads a mask once, ≤ 96 px wide.
 */
export type Area = { w: number; h: number; values: Float32Array };

export const AREA_WIDTH = 96;

/** The area's value (0..1) at a point of the map's 0..1 space (bilinear); outside the map: 0. */
export function areaAt(area: Area, u: number, v: number) {
  if (u < 0 || v < 0 || u > 1 || v > 1) return 0;
  const x = clamp(u * area.w - 0.5, 0, area.w - 1), y = clamp(v * area.h - 0.5, 0, area.h - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(area.w - 1, x0 + 1), y1 = Math.min(area.h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0, at = (i: number, j: number) => area.values[j * area.w + i];
  return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
}

/** The share of the map's rectangle its area takes (0..1). */
export function areaShare(area: Area) {
  let sum = 0;
  for (const v of area.values) sum += v >= 0.5 ? 1 : 0;
  return sum / Math.max(1, area.values.length);
}

/**
 * The point deepest inside the area (0..1 of the map): the cell farthest from any cell outside it (a two-pass
 * chamfer distance), so a thin or crescent-shaped zone still gets a point on its own land. Null when it is empty.
 */
export function areaCentre(area: Area): [number, number] | null {
  const { w, h, values } = area;
  const far = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = values[i] >= 0.5 ? far : 0;
  const ortho = 1, diag = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!d[i]) continue;
    // The border of the picture counts as outside.
    let v = Math.min(d[i], x + 1, y + 1);
    if (x > 0) v = Math.min(v, d[i - 1] + ortho);
    if (y > 0) v = Math.min(v, d[i - w] + ortho);
    if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + diag);
    if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + diag);
    d[i] = v;
  }
  let best = -1, at = -1;
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!d[i]) continue;
    let v = Math.min(d[i], w - x, h - y);
    if (x < w - 1) v = Math.min(v, d[i + 1] + ortho);
    if (y < h - 1) v = Math.min(v, d[i + w] + ortho);
    if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + diag);
    if (x > 0 && y < h - 1) v = Math.min(v, d[i + w - 1] + diag);
    d[i] = v;
    // (Ties go to the cell nearest the middle: a symmetric area keeps its middle.)
    const score = v - Math.hypot((x + 0.5) / w - 0.5, (y + 0.5) / h - 0.5) * 1e-3;
    if (score > best) { best = score; at = i; }
  }
  if (at < 0) return null;
  return [((at % w) + 0.5) / w, (Math.floor(at / w) + 0.5) / h];
}

/** Reads a mask into an area grid (luminance; a mask drawn in alpha: its alpha), `AREA_WIDTH` wide at most. */
export async function loadArea(url: string, aspect: number): Promise<Area> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(String(response.status));
  const bitmap = await createImageBitmap(await response.blob());
  const w = Math.min(AREA_WIDTH, bitmap.width), h = Math.max(2, Math.round(w / Math.max(0.05, aspect)));
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) { bitmap.close?.(); throw new Error("2d"); }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const px = ctx.getImageData(0, 0, w, h).data;
  const values = new Float32Array(w * h);
  for (let i = 0; i < values.length; i++) values[i] = px[i * 4 + 3] < 250 ? px[i * 4 + 3] / 255 : px[i * 4] / 255;
  return { w, h, values };
}
