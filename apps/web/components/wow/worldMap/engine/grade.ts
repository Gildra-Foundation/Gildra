import { clamp } from "./camera";

/**
 * Colour grade of a continent's terrain (the client's minimap textures, darker and greener than the painted map)
 * toward the painted map's palette, so the two read as one world while the zoom hands over from one to the other:
 * a per-channel gain from the ratio of their mean land colours, worked out from both pictures' smallest levels over the same part of
 * the continent, applied partly. Pure math, unit-tested; the loader fetches the two small pictures once.
 */
export type Stats = { mean: [number, number, number]; std: [number, number, number]; n: number };
export type Grade = { mul: [number, number, number]; add: [number, number, number] };
export const IDENTITY: Grade = { mul: [1, 1, 1], add: [0, 0, 0] };

/**
 * Mean and spread of the opaque land pixels of an RGBA picture inside a box (0..1 of it): see-through and
 * water-coloured pixels are left out (the painted sea is not in the ground's land tiles).
 */
export function colourStats(rgba: ArrayLike<number>, w: number, h: number, box: [number, number, number, number] = [0, 0, 1, 1]): Stats {
  const x0 = clamp(Math.floor(box[0] * w), 0, w), x1 = clamp(Math.ceil(box[2] * w), 0, w);
  const y0 = clamp(Math.floor(box[1] * h), 0, h), y1 = clamp(Math.ceil(box[3] * h), 0, h);
  const sum = [0, 0, 0], sq = [0, 0, 0];
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] < 200) continue;
      const r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255;
      if (b - Math.max(r, g * 0.94) > 0.035) continue;
      for (let c = 0; c < 3; c++) { const v = rgba[i + c] / 255; sum[c] += v; sq[c] += v * v; }
      n += 1;
    }
  }
  const mean = sum.map((s) => (n ? s / n : 0)) as Stats["mean"];
  const std = sq.map((s, c) => (n ? Math.sqrt(Math.max(0, s / n - mean[c] * mean[c])) : 0)) as Stats["std"];
  return { mean, std, n };
}

/**
 * The grade taking `from` (the terrain) toward `to` (the painted map), `strength` of the way (0..1): a gain per
 * channel from the ratio of their mean land colours (a pure gain keeps the ground's darks dark: no haze), within
 * 0.75..1.45 so an odd crop never paints the ground a wild colour. Too few pixels: identity.
 */
export function transfer(from: Stats, to: Stats, strength = 0.5): Grade {
  if (from.n < 32 || to.n < 32) return IDENTITY;
  const mul = [0, 1, 2].map((c) => {
    const k = from.mean[c] > 0.02 ? to.mean[c] / from.mean[c] : 1;
    return 1 + (clamp(k, 0.75, 1.45) - 1) * strength;
  }) as Grade["mul"];
  return { mul, add: [0, 0, 0] };
}

/** Applies a grade to one colour (0..1), as the shader does. */
export const applyGrade = (grade: Grade, rgb: [number, number, number]) => rgb.map((v, c) => clamp(v * grade.mul[c] + grade.add[c], 0, 1)) as [number, number, number];

/** A picture's top-left `size` pixels (a tile may carry empty padding past the picture). */
async function picture(url: string, size: readonly [number, number]) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(String(response.status));
  const bitmap = await createImageBitmap(await response.blob());
  const w = Math.max(1, Math.min(bitmap.width, size[0])), h = Math.max(1, Math.min(bitmap.height, size[1]));
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) { bitmap.close?.(); throw new Error("2d"); }
  ctx.drawImage(bitmap, 0, 0, w, h, 0, 0, w, h);
  bitmap.close?.();
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

/**
 * Works out the grade of a terrain: its smallest level against the painted continent's smallest level cropped to
 * the terrain's rect (the part of the continent both pictures show). `artSize`/`groundSize`: the real picture
 * sizes inside those tiles.
 */
export async function loadGrade(art0: string, artSize: readonly [number, number], rect: readonly [number, number, number, number], ground0: string, groundSize: readonly [number, number]): Promise<Grade> {
  const [a, g] = await Promise.all([picture(art0, artSize), picture(ground0, groundSize)]);
  const inner = (v: number) => clamp(v, 0, 1);
  return transfer(colourStats(g.data, g.w, g.h), colourStats(a.data, a.w, a.h, [inner(rect[0]), inner(rect[1]), inner(rect[2]), inner(rect[3])]));
}
