"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useSpringValue } from "./valyro-ui/primitives/useSpringValue";
import styles from "./AtlasCountUp.module.css";
import { lessMotion, subscribeSiteMotion } from "./motionPreference";

/** Actual values are present in server HTML and accessible text. Valyro springs
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
      <span className={styles.final}>{value}</span>
      <span ref={live} className={styles.live} aria-hidden="true">{value}</span>
    </span>
  );
}
