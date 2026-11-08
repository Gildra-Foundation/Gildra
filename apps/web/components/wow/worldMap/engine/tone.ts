import type { Rect } from "@/lib/wow/worldMap/types";

/**
 * The calm backdrop a map around the one in view becomes once it is an
 * ancestor (the continent behind a zone): its whole picture at the smallest
 * level, its painted words filled in from the ground around them, then
 * blurred into a wash of its own colours. No letters, no stripes of magnified
 * texels. Pure pixel math (unit-tested); the canvas glue is at the bottom.
 */

/** Blur radius of the backdrop, as a share of the picture's width: with the words filled in / without word boxes (only tone). */
export const TONE_BLUR = 0.012;
export const TONE_BLUR_BLIND = 0.05;

/**
 * Fills the boxes (0..1 of the picture, grown a little) from the pixels around
 * them, pull-push: averages of the known pixels over a pyramid, pushed back
 * into the holes. RGBA, in place.
 */
export function fillBoxes(data: Uint8ClampedArray, w: number, h: number, boxes: Rect[], grow = 0.004) {
  if (!boxes.length || w < 2 || h < 2) return;
  const n = w * h;
  const known = new Float32Array(n).fill(1);
  for (const [x0, y0, x1, y1] of boxes) {
    const gx = grow * w, gy = grow * w;
    const ax = Math.max(0, Math.floor(x0 * w - gx)), bx = Math.min(w, Math.ceil(x1 * w + gx));
    const ay = Math.max(0, Math.floor(y0 * h - gy)), by = Math.min(h, Math.ceil(y1 * h + gy));
    for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) known[y * w + x] = 0;
  }
  // Pull: a pyramid of plain colours with how much of each is known (0..1).
  type Level = { w: number; h: number; c: Float32Array; k: Float32Array };
  const base: Level = { w, h, c: new Float32Array(n * 3), k: known.slice() };
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) base.c[i * 3 + j] = data[i * 4 + j];
  const levels: Level[] = [base];
  for (let f = base; f.w > 1 || f.h > 1; ) {
    const lw = Math.max(1, Math.ceil(f.w / 2)), lh = Math.max(1, Math.ceil(f.h / 2));
    const c = new Float32Array(lw * lh * 3), k = new Float32Array(lw * lh);
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const i = y * f.w + x, o = (y >> 1) * lw + (x >> 1), ki = f.k[i];
      if (ki <= 0) continue;
      k[o] += ki;
      for (let j = 0; j < 3; j++) c[o * 3 + j] += f.c[i * 3 + j] * ki;
    }
    for (let o = 0; o < lw * lh; o++) {
      if (k[o] > 0) for (let j = 0; j < 3; j++) c[o * 3 + j] /= k[o];
      k[o] = Math.min(1, k[o]);
    }
    f = { w: lw, h: lh, c, k };
    levels.push(f);
  }
  // Push: what a level does not know comes from the coarser one.
  for (let l = levels.length - 2; l >= 0; l--) {
    const f = levels[l], g = levels[l + 1];
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const i = y * f.w + x, o = (y >> 1) * g.w + (x >> 1), ki = f.k[i];
      if (ki >= 1) continue;
      for (let j = 0; j < 3; j++) f.c[i * 3 + j] = f.c[i * 3 + j] * ki + g.c[o * 3 + j] * (1 - ki);
      f.k[i] = 1;
    }
  }
  for (let i = 0; i < n; i++) if (known[i] < 1) for (let j = 0; j < 3; j++) data[i * 4 + j] = Math.round(base.c[i * 3 + j]);
}

/** Separable box blur (three passes ≈ Gaussian) of the RGB channels, radius in px. In place. */
export function blurRgb(data: Uint8ClampedArray, w: number, h: number, radius: number) {
  const r = Math.max(0, Math.round(radius));
  if (r < 1) return;
  const tmp = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) for (let j = 0; j < 3; j++) tmp[i * 3 + j] = data[i * 4 + j];
  const line = new Float32Array(Math.max(w, h) * 3);
  const pass = (horizontal: boolean) => {
    const len = horizontal ? w : h, count = horizontal ? h : w;
    for (let q = 0; q < count; q++) {
      const at = (p: number) => (horizontal ? q * w + p : p * w + q) * 3;
      for (let p = 0; p < len; p++) for (let j = 0; j < 3; j++) line[p * 3 + j] = tmp[at(p) + j];
      for (let j = 0; j < 3; j++) {
        let sum = 0;
        for (let p = -r; p <= r; p++) sum += line[Math.min(len - 1, Math.max(0, p)) * 3 + j];
        for (let p = 0; p < len; p++) {
          tmp[at(p) + j] = sum / (2 * r + 1);
          sum += line[Math.min(len - 1, p + r + 1) * 3 + j] - line[Math.max(0, p - r) * 3 + j];
        }
      }
    }
  };
  for (let k = 0; k < 3; k++) { pass(true); pass(false); }
  for (let i = 0; i < w * h; i++) for (let j = 0; j < 3; j++) data[i * 4 + j] = Math.round(tmp[i * 3 + j]);
}

/** The backdrop of a picture's smallest level: words filled in when their boxes are known, then the wash. */
export function toneImage(data: Uint8ClampedArray, w: number, h: number, boxes: Rect[] | null) {
  if (boxes?.length) fillBoxes(data, w, h, boxes);
  blurRgb(data, w, h, w * (boxes ? TONE_BLUR : TONE_BLUR_BLIND));
}

/** Fetches a picture's smallest level and makes its backdrop on a canvas (for the GPU). */
export async function loadTone(url: string, boxes: Rect[] | null): Promise<HTMLCanvasElement | OffscreenCanvas> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(String(response.status));
  const bitmap = await createImageBitmap(await response.blob());
  const w = bitmap.width, h = bitmap.height;
  const canvas: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("2d");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const image = ctx.getImageData(0, 0, w, h);
  toneImage(image.data, w, h, boxes);
  ctx.putImageData(image, 0, 0);
  return canvas;
}
