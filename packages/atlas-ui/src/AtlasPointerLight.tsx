"use client";

import { useEffect } from "react";
import { lessMotion, subscribeSiteMotion } from "./motionPreference";

/**
 * Torchlight under the cursor for everything marked `data-spotlight` (cards,
 * tiles, path steps, class rows): one pointer listener per page writes the
 * pointer position into --spot-x / --spot-y, and for `data-tilt` elements a
 * gentle 3D tilt into --tilt-x / --tilt-y. After React Bits' Spotlight Card,
 * Border Glow and Tilted Card, rewritten for the atlas: CSS does the drawing,
 * fine pointers only, suspended under reduced motion or while the page is hidden.
 */
export function AtlasPointerLight() {
  useEffect(() => {
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let listening = false;
    let target: HTMLElement | null = null;
    let frame = 0;
    let x = 0;
    let y = 0;

    const release = (element: HTMLElement | null) => {
      element?.style.removeProperty("--tilt-x");
      element?.style.removeProperty("--tilt-y");
    };
    const paint = () => {
      frame = 0;
      if (!target) return;
      const box = target.getBoundingClientRect();
      const left = x - box.left;
      const top = y - box.top;
      target.style.setProperty("--spot-x", `${left.toFixed(1)}px`);
      target.style.setProperty("--spot-y", `${top.toFixed(1)}px`);
      if (target.hasAttribute("data-tilt")) {
        target.style.setProperty("--tilt-x", `${((left / box.width - 0.5) * 9).toFixed(2)}deg`);
        target.style.setProperty("--tilt-y", `${((0.5 - top / box.height) * 7).toFixed(2)}deg`);
      }
    };
    const move = (event: PointerEvent) => {
      const next = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-spotlight]") : null;
      if (next !== target) {
        release(target);
        target = next;
      }
      if (!target) return;
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      target?.style.removeProperty("--spot-x");
      target?.style.removeProperty("--spot-y");
      release(target);
      target = null;
    };

    const sync = () => {
      const enabled = pointer.matches && !lessMotion() && !document.hidden;
      if (enabled === listening) return;
      listening = enabled;
      if (enabled) {
        document.addEventListener("pointermove", move, { passive: true });
        document.documentElement.addEventListener("pointerleave", leave);
      } else {
        document.removeEventListener("pointermove", move);
        document.documentElement.removeEventListener("pointerleave", leave);
        leave();
      }
    };
    // Preferences can change without a remount. Cancelling both the listener
    // and queued frame also stops geometry reads and gradient repaints.
    const unsubscribe = subscribeSiteMotion(sync);
    pointer.addEventListener("change", sync);
    motion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      unsubscribe();
      pointer.removeEventListener("change", sync);
      motion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      leave();
    };
  }, []);
  return null;
}
