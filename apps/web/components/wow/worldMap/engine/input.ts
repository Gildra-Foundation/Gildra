/**
 * What a wheel event is: a mouse wheel notch (lines/pages, or a whole-number
 * step of 50+ px with no sideways part), a trackpad pinch (ctrl + wheel, as
 * browsers report it) or a trackpad scroll (small, fractional, often sideways).
 */
export type WheelKind = "notch" | "pinch" | "trackpad";
export function wheelKind(deltaMode: number, deltaX: number, deltaY: number, ctrlKey: boolean): WheelKind {
  if (ctrlKey && deltaMode === 0 && Math.abs(deltaY) < 50) return "pinch";
  if (deltaMode !== 0) return "notch";
  if (deltaX === 0 && Math.abs(deltaY) >= 50 && Math.abs(deltaY - Math.round(deltaY)) < 1e-3) return "notch";
  return "trackpad";
}
