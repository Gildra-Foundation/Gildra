"use client";

import { useEffect } from "react";
import { lessMotion } from "./motionPreference";

/**
 * Torchlight under the cursor for everything marked `data-spotlight` (cards,
 * tiles, path steps, class rows): one pointer listener per page writes the
 * pointer position into --spot-x / --spot-y, and for `data-tilt` elements a
 * gentle 3D tilt into --tilt-x / --tilt-y. After React Bits' Spotlight Card,
 * Border Glow and Tilted Card, rewritten for the atlas: CSS does the drawing,
 * fine pointers only, no tilt under reduced motion.
 */
export function AtlasPointerLight() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const still = lessMotion();
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
      if (!still && target.hasAttribute("data-tilt")) {
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
      release(target);
      target = null;
    };

    document.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(frame);
      release(target);
    };
  }, []);
  return null;
}
