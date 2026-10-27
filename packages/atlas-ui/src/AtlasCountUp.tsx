"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useSpringValue } from "./valyro-ui/primitives/useSpringValue";
import styles from "./AtlasCountUp.module.css";
import { lessMotion, subscribeSiteMotion } from "./motionPreference";

/** Actual values are present in server HTML and accessible text (once: the box-holder is CSS content). Valyro springs
 * subsequent metric updates without React renders per animation frame. */
export function AtlasCountUp({ value }: { value: number }) {
  const live = useRef<HTMLSpanElement>(null);
  const reduced = useSyncExternalStore(subscribeSiteMotion, lessMotion, () => true);
  // Track the OS setting as well as the site's own footer preference. Valyro's
  // spring also checks matchMedia before starting every animation.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => window.dispatchEvent(new Event("gildra-motion-change"));
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useSpringValue(value, current => {
    if (live.current) live.current.textContent = String(current === value ? value : Number.isInteger(value) ? Math.round(current) : Number(current.toFixed(2)));
  }, { spring: "smooth", tempoRef: live, enabled: !reduced });

  return (
    <span className={styles.count}>
      {/* The final value only holds the box (CSS content, so the page text reads the number once). */}
      <span className={styles.final} data-value={value} aria-hidden="true" />
      <span ref={live} className={styles.live}>{value}</span>
    </span>
  );
}
