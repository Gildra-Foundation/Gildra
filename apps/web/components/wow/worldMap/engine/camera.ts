/**
 * Camera of the world map: a centre in atlas space and a scale in CSS pixels
 * per atlas unit. Pure math, no DOM.
 */
export type Camera = { x: number; y: number; scale: number };
export type Box = [number, number, number, number];

export const toScreen = (camera: Camera, width: number, height: number, x: number, y: number): [number, number] =>
  [(x - camera.x) * camera.scale + width / 2, (y - camera.y) * camera.scale + height / 2];
export const toAtlas = (camera: Camera, width: number, height: number, sx: number, sy: number): [number, number] =>
  [(sx - width / 2) / camera.scale + camera.x, (sy - height / 2) / camera.scale + camera.y];

/** Camera that shows a box whole, with a margin (fraction of the viewport). */
export function fitBox(box: Box, width: number, height: number, margin = 0.06): Camera {
  const w = box[2] - box[0], h = box[3] - box[1];
  const scale = Math.min((width * (1 - margin * 2)) / w, (height * (1 - margin * 2)) / h);
  return { x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2, scale };
}

/** Zoom by a factor keeping the atlas point under (sx, sy) fixed. */
export function zoomAt(camera: Camera, width: number, height: number, sx: number, sy: number, factor: number): Camera {
  const [ax, ay] = toAtlas(camera, width, height, sx, sy);
  const scale = camera.scale * factor;
  return { scale, x: ax - (sx - width / 2) / scale, y: ay - (sy - height / 2) / scale };
}

/**
 * Smooth zoom-and-pan between two views (van Wijk & Nuij, "Smooth and
 * efficient zooming and panning", 2003): zooms out while it travels far, the
 * way a game camera flies. Returns the path and its length in "S" units.
 */
export function flightPath(from: Camera, to: Camera, width: number, height: number, rho = 1.42) {
  const w0 = Math.max(width, height) / from.scale;
  const w1 = Math.max(width, height) / to.scale;
  const dx = to.x - from.x, dy = to.y - from.y;
  const u1 = Math.hypot(dx, dy);
  const rho2 = rho * rho;
  if (u1 < 1e-9 * w0) {
    const S = Math.abs(Math.log(w1 / w0)) / rho;
    return {
      S,
      at(t: number): Camera {
        const w = w0 * Math.exp(Math.log(w1 / w0) * t);
        return { x: from.x + dx * t, y: from.y + dy * t, scale: Math.max(width, height) / w };
      },
    };
  }
  const b0 = (w1 * w1 - w0 * w0 + rho2 * rho2 * u1 * u1) / (2 * w0 * rho2 * u1);
  const b1 = (w1 * w1 - w0 * w0 - rho2 * rho2 * u1 * u1) / (2 * w1 * rho2 * u1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / rho;
  return {
    S,
    at(t: number): Camera {
      const s = t * S;
      const coshr0 = Math.cosh(r0);
      const u = (w0 / (rho2 * u1)) * (coshr0 * Math.tanh(rho * s + r0) - Math.sinh(r0));
      const w = (w0 * coshr0) / Math.cosh(rho * s + r0);
      return { x: from.x + dx * u, y: from.y + dy * u, scale: Math.max(width, height) / w };
    },
  };
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const intersects = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
export const contains = (b: Box, x: number, y: number) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
