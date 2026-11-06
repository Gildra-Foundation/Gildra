"use client";

import type { CSSProperties, ReactNode } from "react";
import { useSwapMotion } from "./swapMotion";

/**
 * A box whose content switches in place (a filtered list, the open source of a
 * tier list, a page of results): when `swapKey` changes, the new content fades
 * in and the box eases to its new height (swapMotion.ts). Key it on what is
 * shown, so the previous content stays until the new one is ready.
 */
export function AtlasSwap({ swapKey, direction = 0, className, style, children }: {
  swapKey: unknown;
  /** −1 / 1 when the new content belongs to an option before / after the previous one. */
  direction?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useSwapMotion<HTMLDivElement>(swapKey, direction);
  // min-width 0 inline, not in a stylesheet: a new CSS module in the kit regroups the CSS chunks of
  // every page and can reorder rules of equal weight. As a grid or flex item, wide content (a
  // scrolling table) must not stretch the box.
  return <div ref={ref} className={className} style={{ minWidth: 0, ...style }} data-atlas-swap>{children}</div>;
}
