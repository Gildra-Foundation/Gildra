import type { MapArt } from "@/lib/wow/worldMap/types";
import { clamp, smoothstep } from "./camera";

/**
 * Level-of-detail rules of the world map, pure math (unit-tested):
 * how much a map is magnified on screen, how far out of focus that puts it,
 * which level of its tile pyramid to draw, when the deep-zoom ground takes
 * over and how deep the camera may go.
 *
 * "Upscale" is CSS pixels of screen per texel of the art: 1 = the art's own
 * size. Up to ~1.5 the picture reads crisp; past that a map is a backdrop:
 * it goes out of focus (blur), a little darker and greyer, the stronger the
 * more it is magnified — never raw magnified texels.
 */
export const SHARP_UPSCALE = 1.5;

export const upscaleOf = (screenWidthCss: number, art: Pick<MapArt, "width">) => screenWidthCss / Math.max(1, art.width);

/** Out-of-focus strength 0 (sharp) … 1 (a soft backdrop). */
export const blurOf = (upscale: number) => smoothstep(SHARP_UPSCALE + 0.1, 5, upscale);
/** Blur radius on screen, device px: up to ~22 CSS px. */
export const blurRadiusPx = (blur: number, dpr: number) => blur * 22 * dpr;
/** How much darker an out-of-focus map is drawn (0..0.34). */
export const dimOf = (upscale: number) => 0.34 * smoothstep(SHARP_UPSCALE + 0.3, 9, upscale);
/** How much greyer (0..0.3). */
export const desatOf = (upscale: number) => 0.3 * smoothstep(2.5, 10, upscale);

/** Blur strengths closer than this share one offscreen pass. */
export const BLUR_GROUP = 0.18;
/** Below this the blur is not worth a pass: drawn sharp. */
export const BLUR_MIN = 0.06;

/**
 * Offscreen scale for a blur of `radius` device px: a power of two (2…16)
 * that leaves 1.5…3 px of blur to do in the smaller picture.
 */
export function layerScale(radius: number) {
  const s = 2 ** Math.ceil(Math.log2(Math.max(1, radius / 3)));
  return clamp(s, 2, 16);
}

/**
 * Pyramid level for a picture drawn `deviceWidth` px wide: the smallest one
 * not magnified by more than ~10% (z = maxZoom is the art's own size).
 */
export function levelFor(art: Pick<MapArt, "width" | "maxZoom">, deviceWidth: number) {
  let z = 0;
  while (z < art.maxZoom && Math.ceil(art.width / 2 ** (art.maxZoom - z)) < deviceWidth * 0.9) z += 1;
  return z;
}

/** The ground (terrain) over the painted maps: in once the finest painted map at the centre is magnified past ~1.3×. */
export const terrainAlphaOf = (finestUpscale: number) => smoothstep(1.35, 1.9, finestUpscale);

/**
 * Deepest zoom (CSS px per atlas unit) over a map: twice its art's own size;
 * over a continent's terrain, twice the terrain's own size.
 */
export function maxScaleOf(art: Pick<MapArt, "width">, frameWidth: number, terrain?: { art: Pick<MapArt, "width">; frame: [number, number, number, number] } | null) {
  const own = (art.width / Math.max(1e-12, frameWidth)) * 2;
  if (!terrain) return own;
  return Math.max(own, (terrain.art.width / Math.max(1e-12, terrain.frame[2] - terrain.frame[0])) * 2);
}

/**
 * Soft edge of a map laid over its parent when it has no mask (device px):
 * the art's own painted border (~2.5% of the smaller side) left out, then a
 * vignette up to 11% — at least 6% of the side is soft.
 */
export const featherOf = (deviceW: number, deviceH: number, dpr: number) => Math.max(Math.min(deviceW, deviceH) * 0.11, 8 * dpr);
export const featherInsetOf = (deviceW: number, deviceH: number) => Math.min(deviceW, deviceH) * 0.025;
/** With a mask the mask draws the edge; only a thin rect feather stays against hard art borders. */
export const maskFeatherOf = (deviceW: number, deviceH: number, dpr: number) => Math.max(Math.min(deviceW, deviceH) * 0.015, 2 * dpr);

/** Groups consecutive out-of-focus draws whose blur strengths are close: one offscreen pass each. */
export function blurGroups(blurs: number[]): Array<{ from: number; to: number; blur: number }> {
  const out: Array<{ from: number; to: number; blur: number }> = [];
  let i = 0;
  while (i < blurs.length) {
    const b = blurs[i];
    if (b < BLUR_MIN) { out.push({ from: i, to: i, blur: 0 }); i += 1; continue; }
    let j = i, lo = b, hi = b;
    while (j + 1 < blurs.length && blurs[j + 1] >= BLUR_MIN && Math.max(hi, blurs[j + 1]) - Math.min(lo, blurs[j + 1]) <= BLUR_GROUP) {
      j += 1;
      lo = Math.min(lo, blurs[j]);
      hi = Math.max(hi, blurs[j]);
    }
    let sum = 0;
    for (let k = i; k <= j; k++) sum += blurs[k];
    out.push({ from: i, to: j, blur: sum / (j - i + 1) });
    i = j + 1;
  }
  return out;
}
