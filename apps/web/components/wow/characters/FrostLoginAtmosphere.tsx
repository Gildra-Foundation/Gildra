"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { lessMotion } from "@gildra/atlas-ui/motionPreference";
import styles from "./frostLogin.module.css";

// Position and timing only; size, brightness and drift come from the stylesheet (nth-child),
// so the keyframes stay free of custom properties and run on the compositor.
const snow = Array.from({ length: 32 }, (_, index) => ({
  left: `${(index * 23.71) % 100}%`,
  animationDelay: `${-((index * 3.193) % 27)}s`,
  animationDuration: `${16 + (index * 1.719) % 20}s`,
}) satisfies CSSProperties);

const shards = Array.from({ length: 8 }, (_, index) => ({
  left: `${(index * 31.73 + 7) % 100}%`,
  animationDelay: `${-((index * 4.217) % 24)}s`,
  animationDuration: `${20 + (index * 2.13) % 14}s`,
}) satisfies CSSProperties);

/** CSS owns the weather; JS only pauses it when hidden or motion is reduced. */
export function FrostLoginAtmosphere() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    const frame = element?.closest("[data-frost-login]");
    if (!element || !frame) return;
    let visible = true;
    const queries = [
      matchMedia("(prefers-reduced-motion: reduce)"),
      matchMedia("(prefers-reduced-transparency: reduce)"),
      matchMedia("(forced-colors: active)"),
    ];
    const sync = () => {
      const reduced = lessMotion() || queries.some(query => query.matches)
        || Boolean(element.closest('[data-ui-motion="reduce"], [data-transparency="reduced"]'));
      frame.setAttribute("data-frost-active", String(visible && !document.hidden && !reduced));
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(element);
    const preferences = new MutationObserver(sync);
    preferences.observe(document.documentElement, { attributes: true, subtree: true,
      attributeFilter: ["data-motion", "data-ui-motion", "data-transparency"] });
    queries.forEach(query => query.addEventListener("change", sync));
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      observer.disconnect();
      preferences.disconnect();
      queries.forEach(query => query.removeEventListener("change", sync));
      document.removeEventListener("visibilitychange", sync);
      frame.removeAttribute("data-frost-active");
    };
  }, []);
  return <div ref={root} className={styles.atmosphere} aria-hidden="true">
    <span className={styles.haze}>
      <span className={styles.mist} />
      <span className={`${styles.wind} ${styles.windFar}`} />
    </span>
    <span className={styles.wind} />
    {snow.map((style, index) => <i key={index} className={styles.snow} style={style} />)}
    {shards.map((style, index) => <i key={`ice-${index}`} className={styles.shard} style={style} />)}
  </div>;
}
