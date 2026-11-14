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
// It sets in quickly past the sharp limit (a square root of the ramp): a map 2× magnified is visibly, deliberately
// out of focus — like depth of field — never a sharp-looking picture of soft magnified texels.
export const blurOf = (upscale: number) => Math.sqrt(smoothstep(SHARP_UPSCALE, 5, upscale));
/**
 * Blur radius on screen, CSS px. It grows with the magnification itself: a
 * texel magnified 20× is a 20 px block, so the blur must be wider than that to
 * hide it. Far magnified pictures (a continent behind a city) end as a calm,
 * low-frequency wash of their own colours — no stripes, no readable letters.
 */
export const BLUR_MAX_CSS = 200;
export const blurRadiusCss = (blur: number, upscale = 0) => (blur <= 0 ? 0 : Math.min(BLUR_MAX_CSS, Math.max(blur * 22, blur * upscale * 9)));
/** Blur radius on screen, device px. */
export const blurRadiusPx = (blur: number, dpr: number, upscale = 0) => blurRadiusCss(blur, upscale) * dpr;
/** How much darker an out-of-focus map is drawn (0..0.46): the map in focus reads as the hero. */
export const dimOf = (upscale: number) => 0.24 * smoothstep(SHARP_UPSCALE + 0.3, 6, upscale) + 0.22 * smoothstep(6, 18, upscale);
/** How much greyer (0..0.36). */
export const desatOf = (upscale: number) => 0.36 * smoothstep(2.5, 12, upscale);
/** Darkening toward the screen's edges over a far magnified backdrop (0..0.3). */
export const vignetteOf = (upscale: number) => 0.3 * smoothstep(3, 10, upscale);

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
  return clamp(s, 2, 64);
}

/** Grouping key of a blur: draws whose radii are within ~1.6× share one offscreen pass. */
export const blurKey = (radiusCss: number) => (radiusCss <= 0 ? 0 : Math.max(BLUR_MIN, Math.log2(1 + radiusCss) / 8));
export const radiusOfKey = (key: number) => (key <= 0 ? 0 : 2 ** (key * 8) - 1);

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
 * Deepest zoom (CSS px per atlas unit) over a map: its art just past the sharp
 * limit (1.6× its own size); over a continent's terrain, twice the terrain's own
 * texel density (the last ×2 sharpened in the shader, never shown coarser).
 */
export const MAX_UPSCALE = 1.6;
export const TERRAIN_MAX_UPSCALE = 2;
export function maxScaleOf(art: Pick<MapArt, "width">, frameWidth: number, terrain?: { art: Pick<MapArt, "width">; frame: [number, number, number, number] } | null) {
  const own = (art.width / Math.max(1e-12, frameWidth)) * MAX_UPSCALE;
  if (!terrain) return own;
  return Math.max(own, (terrain.art.width / Math.max(1e-12, terrain.frame[2] - terrain.frame[0])) * TERRAIN_MAX_UPSCALE);
}

/**
 * Unsharp strength for a picture drawn `devicePerTexel` device px per texel of its finest level: none at its own
 * size or below, rising to ~0.3 at twice its size (bilinear magnification softens it; this gives the edges back).
 */
export const sharpenOf = (devicePerTexel: number) => 0.3 * smoothstep(1.15, 2.2, devicePerTexel);
/**
 * Smoothing for the terrain magnified past its finest level (a negative unsharp: part of each texel's 4-neighbour
 * mean). The client's minimap pictures carry 4×4 block compression and the old ones a 1-texel checker of dithering:
 * sharpened or merely magnified they read as blocks and a grid; softened they read as ground.
 */
export const smoothOf = (devicePerTexel: number) => 0.8 * smoothstep(1.1, 2, devicePerTexel);

/**
 * Rubber band at a zoom limit: zoom asked for past the limit (log units, any sign) shows as a small, ever harder
 * overshoot (at most RUBBER of log zoom, ~10%), then springs back.
 */
export const RUBBER = 0.1;
export const rubber = (excess: number) => Math.sign(excess) * RUBBER * (1 - Math.exp(-Math.abs(excess) / RUBBER));

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
