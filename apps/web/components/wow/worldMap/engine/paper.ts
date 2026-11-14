/**
 * Some pictures (Classic's cities) are drawn on a plain sheet and their mask
 * is only a soft rectangle: the sheet would show as a pale block over the zone
 * around. These helpers tell such a mask apart and find the sheet's colour on
 * the picture's border, so the renderer lets the bare sheet give way to the
 * map under it. The math is pure (unit-tested); `analysePaper` reads pixels.
 */

/** A mask that is white over nearly all of its inner part (no shape of a place): a soft rectangle. */
export function isRectMask(values: ArrayLike<number>, width: number, height: number) {
  let inside = 0, white = 0;
  for (let y = Math.floor(height * 0.15); y < Math.ceil(height * 0.85); y++) {
    for (let x = Math.floor(width * 0.15); x < Math.ceil(width * 0.85); x++) {
      inside += 1;
      if (values[y * width + x] >= 0.9) white += 1;
    }
  }
  return inside > 0 && white / inside >= 0.97;
}

/**
 * The sheet's colour: the median of the opaque pixels in a ring just inside the
 * picture's border (5–15% in), where a city map has nothing drawn yet. RGBA bytes.
 */
export function paperColour(rgba: ArrayLike<number>, width: number, height: number): [number, number, number] | null {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const e = Math.min(x / width, 1 - x / width, y / height, 1 - y / height);
      if (e < 0.05 || e > 0.15) continue;
      const i = (y * width + x) * 4;
      if (rgba[i + 3] < 230) continue;
      rs.push(rgba[i]); gs.push(rgba[i + 1]); bs.push(rgba[i + 2]);
    }
  }
  if (rs.length < 16) return null;
  const median = (list: number[]) => list.sort((a, b) => a - b)[list.length >> 1] / 255;
  return [median(rs), median(gs), median(bs)];
}

async function pixels(url: string, width?: number, height?: number) {
  const blob = await (await fetch(url, { cache: "force-cache" })).blob();
  const bitmap = await createImageBitmap(blob);
  const w = width ?? bitmap.width, h = height ?? bitmap.height;
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) { bitmap.close?.(); return null; }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return ctx.getImageData(0, 0, w, h).data;
}

/**
 * The sheet colour of a picture whose mask is a soft rectangle, else null.
 * `art0` is the picture's whole-image tile (level 0) and `size` its real size in it.
 */
export async function analysePaper(mask: string, art0: string, size: [number, number]): Promise<[number, number, number] | null> {
  const mw = 64, mh = Math.max(8, Math.round(64 * size[1] / size[0]));
  const m = await pixels(mask, mw, mh);
  if (!m) return null;
  const values = new Float32Array(mw * mh);
  for (let i = 0; i < values.length; i++) values[i] = m[i * 4] / 255;
  if (!isRectMask(values, mw, mh)) return null;
  const blob = await (await fetch(art0, { cache: "force-cache" })).blob();
  const bitmap = await createImageBitmap(blob, 0, 0, size[0], size[1]);
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(size[0], size[1]) : Object.assign(document.createElement("canvas"), { width: size[0], height: size[1] });
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) { bitmap.close?.(); return null; }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return paperColour(ctx.getImageData(0, 0, size[0], size[1]).data, size[0], size[1]);
}
