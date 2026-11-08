import { clamp } from "./camera";
import type { WheelKind } from "./input";

/**
 * How the camera moves, pure math (unit-tested): zoom wanted by the wheel, the
 * buttons, the keys or a double click is gathered into a target that the
 * camera eases towards — exponentially, so the path is the same at 30, 60 or
 * 144 frames a second — with the point under the cursor held in place; and
 * the map in view changes with some hysteresis, so it does not flicker at a
 * threshold.
 */

/** Zoom of one mouse wheel notch (100 px of wheel in Chrome): ×1.3. */
export const NOTCH_LOG = Math.log(1.3);
/** Most zoom the target may run ahead of the camera: a fast spin of the wheel never flies through levels in one go. */
export const MAX_AHEAD = Math.log(3);
/** Time constants of the ease (ms): a mouse wheel glides; a pinch or trackpad (smooth by itself) follows closely. */
export const TAU_NOTCH = 130;
export const TAU_SMOOTH = 45;

/** Log zoom (positive = in) asked for by one wheel event, by its kind (`dy` in CSS px). */
export function wheelLog(kind: WheelKind, dy: number): number {
  if (dy === 0) return 0;
  if (kind === "notch") return -Math.sign(dy) * clamp(Math.abs(dy) / 100, 0.5, 3) * NOTCH_LOG;
  if (kind === "pinch") return -clamp(dy, -60, 60) * 0.011;
  return -clamp(dy, -120, 120) * 0.0042;
}

/**
 * Adds zoom to what is still to come. Turning the wheel back drops what was left in the other direction
 * (the camera turns at once instead of finishing the old way first); the total stays within MAX_AHEAD.
 */
export function gather(left: number, add: number): number {
  const base = left !== 0 && Math.sign(left) !== Math.sign(add) ? 0 : left;
  return clamp(base + add, -MAX_AHEAD, MAX_AHEAD);
}

/**
 * The part of the remaining zoom spent in `dt` ms: 1 − e^(−dt/τ) of it. Two frames of 8 ms spend exactly
 * what one of 16 ms does, so the zoom feels the same at any frame rate. Returns [spent, left].
 */
export function spend(left: number, dt: number, tau: number): [number, number] {
  if (tau <= 0 || dt <= 0) return dt <= 0 ? [0, left] : [left, 0];
  const step = left * (1 - Math.exp(-dt / tau));
  return [step, left - step];
}

/** Below this the remaining zoom is done (it would move the view by less than ~0.2%). */
export const ZOOM_DONE = 0.002;

/**
 * The map in view, with hysteresis. `candidate`: the deepest map well open under the point the reader looks
 * at; `current`: the map in view so far, how far the zoom has it open, and whether it is still "under" (the
 * point inside its rectangle, or it still fills a good part of the view); `relation`: where the candidate is
 * from the current one; `zoom`: the zoom's direction now (1 in, −1 out, 0 still).
 *  - down into a child once it is clearly open, and never while zooming out;
 *  - up a level only by zooming out (once the current one has clearly faded) or when it has left the view;
 *  - to a map beside it (zone rectangles overlap) only once the current one is no longer under the point (for a
 *    map beside it the caller also counts the point clearly nearer the other one's middle as "not under").
 * No flip-flop while the camera rests or moves near a threshold.
 */
export const FOCUS_IN = 0.62;
export const FOCUS_OUT = 0.36;
export function holdFocus(
  current: { id: number; alpha: number; under: boolean } | null,
  candidate: { id: number; alpha: number },
  relation: "deeper" | "above" | "other",
  zoom = 0,
): number {
  if (!current || current.id === candidate.id) return candidate.id;
  if (relation === "deeper") return candidate.alpha >= FOCUS_IN && zoom >= 0 ? candidate.id : current.id;
  if (!current.under) return candidate.id;
  if (relation === "above") return zoom < 0 && current.alpha < FOCUS_OUT ? candidate.id : current.id;
  return current.id;
}

/** Cross-fade of the picture when the map in view changes (ms). */
export const FOCUS_FADE = 340;
/** Opacity of the outgoing picture `t` ms into the cross-fade (1 → 0, eased). */
export function fadeOut(t: number, duration = FOCUS_FADE) {
  const x = clamp(t / duration, 0, 1);
  return 1 - x * x * (3 - 2 * x);
}
