// Where the talent tooltip goes: beside its node, never over it, always inside the viewport.

const GAP = 12;
const MARGIN = 10;

export type Spot = { x: number; y: number };
type Box = Pick<DOMRect, "top" | "right" | "bottom" | "left" | "width" | "height">;

/** Places the tooltip beside its node (right, left, above, below — the first that fits), never over it, inside the viewport. */
export function placeTooltip(anchor: Box, width: number, height: number, viewport: { width: number; height: number }): Spot {
  const clampX = (x: number) => Math.max(MARGIN, Math.min(x, viewport.width - width - MARGIN));
  const clampY = (y: number) => Math.max(MARGIN, Math.min(y, viewport.height - height - MARGIN));
  const middleY = clampY(anchor.top + anchor.height / 2 - height / 2);
  const middleX = clampX(anchor.left + anchor.width / 2 - width / 2);
  if (anchor.right + GAP + width <= viewport.width - MARGIN && height <= viewport.height - 2 * MARGIN) return { x: anchor.right + GAP, y: middleY };
  if (anchor.left - GAP - width >= MARGIN && height <= viewport.height - 2 * MARGIN) return { x: anchor.left - GAP - width, y: middleY };
  if (anchor.top - GAP - height >= MARGIN) return { x: middleX, y: anchor.top - GAP - height };
  if (anchor.bottom + GAP + height <= viewport.height - MARGIN) return { x: middleX, y: anchor.bottom + GAP };
  // Taller than any free side: keep it on the roomier side, beside the node's row.
  const roomBelow = viewport.height - anchor.bottom;
  return { x: middleX, y: roomBelow > anchor.top ? anchor.bottom + GAP : Math.max(MARGIN, anchor.top - GAP - height) };
}

