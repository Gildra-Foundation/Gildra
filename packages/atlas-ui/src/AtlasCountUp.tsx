"use client";

import { useLayoutEffect, useRef } from "react";
import styles from "./AtlasCountUp.module.css";
import { lessMotion } from "./motionPreference";

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
    if (lessMotion()) return;
    const duration = 800;
    let frame = 0;
    let cancelled = false;
    let start = 0;
    const tick = (now: number) => {
      start ||= now;
      const progress = Math.min(1, (now - start) / duration);
      element.textContent = String(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    element.textContent = "0";
    // Count once the page has landed: digits changing while the View Transition
    // runs would re-render the live "new" snapshot on every frame.
    const transition = (document as Document & { activeViewTransition?: ViewTransition | null }).activeViewTransition;
    const landed = transition ? transition.finished.catch(() => undefined) : new Promise((resolve) => setTimeout(resolve, 260));
    landed.then(() => { if (!cancelled) frame = requestAnimationFrame(tick); });
    return () => {
      cancelled = true;
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
