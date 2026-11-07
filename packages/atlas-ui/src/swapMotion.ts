"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { lessMotion } from "./motionPreference";
import { ATLAS_DURATION, ATLAS_EASE } from "./motionTokens";

/**
 * One motion for every in-page switch of the atlas (tabs, segmented filters,
 * source/region/role switches, view toggles, paging): the new content fades in
 * while rising a few pixels (or sliding sideways, towards the chosen option),
 * and the box eases from its old height to the new one, so what follows moves
 * with it instead of jumping. 200 ms on the atlas curve, the tempo of the page
 * hand-over (app/styles/route-motion.css). Nothing runs with less motion (the
 * system setting, the site's own switch or a `data-ui-motion="reduce"` scope).
 *
 * Only the box that changed animates (opacity and translate are composited);
 * the height eases only when it changes by more than a few pixels and the
 * box's lower edge (before or after) is on screen. The previous height comes from a ResizeObserver, so nothing is
 * measured before the switch.
 */
export const SWAP_MS = ATLAS_DURATION;
export const SWAP_EASE = ATLAS_EASE;
const CONTENT = "atlas-swap";
const SIZE = "atlas-swap-size";

export type SwapOptions = {
  /** The box's height before the switch (px). Without it the height does not ease. */
  fromHeight?: number;
  /** −1 / 1: the new content comes from the left / right (an option further along); 0: it rises. */
  direction?: number;
};

export function swapMotionAllowed(element: Element) {
  return typeof window !== "undefined" && typeof (element as HTMLElement).animate === "function"
    && !lessMotion() && !element.closest('[data-ui-motion="reduce"]');
}

/** Plays the switch on `element`, whose new content is already in the DOM (call from a layout effect). */
export function playSwap(element: HTMLElement, { fromHeight, direction = 0 }: SwapOptions = {}) {
  if (!swapMotionAllowed(element)) return;
  for (const animation of element.getAnimations()) {
    if (animation.id === CONTENT || animation.id === SIZE) animation.cancel();
  }
  const box = element.getBoundingClientRect();
  if (box.bottom <= 0 || box.top >= window.innerHeight || box.width === 0) return;
  const shift = direction ? `${Math.sign(direction) * 10}px 0` : "0 6px";
  const content = element.animate([{ opacity: 0, translate: shift }, { opacity: 1, translate: "0 0" }], { duration: SWAP_MS, easing: SWAP_EASE });
  content.id = CONTENT;
  if (fromHeight === undefined || Math.abs(fromHeight - box.height) < 4) return;
  // A change below the fold is not seen, only paid for (a layout of the page every frame): skip it.
  if (Math.min(box.top + fromHeight, box.bottom) >= window.innerHeight) return;
  // The box clips while it eases so taller new content is revealed, not spilled over what follows.
  const overflow = element.style.overflow;
  element.style.overflow = "clip";
  const size = element.animate([{ height: `${fromHeight}px` }, { height: `${box.height}px` }], { duration: SWAP_MS, easing: SWAP_EASE });
  size.id = SIZE;
  const restore = () => { element.style.overflow = overflow; };
  size.finished.then(restore, restore);
}

/**
 * The switch motion for a box whose content follows `key`: when the key
 * changes, the box plays playSwap() with its previous height. Give the key of
 * what is shown (the loaded data, not the pressed option), so a switch that
 * waits for data keeps the old content until the new one is there.
 */
export function useSwapMotion<T extends HTMLElement>(key: unknown, direction = 0) {
  const ref = useRef<T>(null);
  const shown = useRef(key);
  const height = useRef<number | undefined>(undefined);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => { height.current = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height; });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (Object.is(shown.current, key)) return;
    shown.current = key;
    if (ref.current) playSwap(ref.current, { fromHeight: height.current, direction });
    // `direction` belongs to the switch that changed the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return ref;
}

/** Index step from one option to another in a list (for `direction`): −1, 0 or 1. */
export function swapDirection<T>(options: readonly T[], from: T, to: T) {
  const a = options.indexOf(from);
  const b = options.indexOf(to);
  return a < 0 || b < 0 ? 0 : Math.sign(b - a);
}
