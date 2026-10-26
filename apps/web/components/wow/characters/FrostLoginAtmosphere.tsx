"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { lessMotion } from "@gildra/atlas-ui/motionPreference";
import styles from "./frostLogin.module.css";

const snow = Array.from({ length: 48 }, (_, index) => ({
  "--snow-x": `${(index * 23.71) % 100}%`,
  "--snow-delay": `${-((index * 3.193) % 27)}s`,
  "--snow-duration": `${16 + (index * 1.719) % 20}s`,
  "--snow-size": `${index % 7 === 0 ? 4 : index % 3 === 0 ? 3 : 2}px`,
  "--snow-drift": `${40 + (index * 17) % 120}px`,
}) as CSSProperties);

const shards = Array.from({ length: 12 }, (_, index) => ({
  "--snow-x": `${(index * 31.73 + 7) % 100}%`,
  "--snow-delay": `${-((index * 4.217) % 24)}s`,
  "--snow-duration": `${20 + (index * 2.13) % 14}s`,
  "--snow-size": `${7 + index % 4 * 2}px`,
  "--snow-drift": `${100 + index % 5 * 35}px`,
}) as CSSProperties);

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
    <span className={styles.mist} />
    <span className={styles.wind} />
    <span className={`${styles.wind} ${styles.windFar}`} />
    {snow.map((style, index) => <i key={index} className={styles.snow} style={style} />)}
    {shards.map((style, index) => <i key={`ice-${index}`} className={styles.shard} style={style} />)}
  </div>;
}
