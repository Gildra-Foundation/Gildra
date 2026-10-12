"use client";

import { useLayoutEffect, useRef } from "react";
import styles from "./AtlasCountUp.module.css";

/**
 * A headline number that counts up as its page arrives through in-site
 * navigation (after React Bits' Count Up, rewritten for the atlas). A first page
 * load shows the final number at once, so hydration never flashes a zero. The
 * transparent final value holds the width, so counting never shifts the layout,
 * and it is the text screen readers get.
 */
export function AtlasCountUp({ value }: { value: number }) {
  const live = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = live.current;
    // The page is mounting while the route runtime is still leaving/loading: an arrival.
    if (!element?.closest('[data-route-state="leaving"], [data-route-state="loading"]')) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now() + 260;
    const duration = 900;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      element.textContent = String(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    element.textContent = "0";
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      element.textContent = String(value);
    };
  }, [value]);

  return (
    <span className={styles.count}>
      <span className={styles.final}>{value}</span>
      <span ref={live} className={styles.live} aria-hidden="true">{value}</span>
    </span>
  );
}
