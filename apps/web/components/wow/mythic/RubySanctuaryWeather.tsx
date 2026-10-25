"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import styles from "./rubySanctuaryWeather.module.css";

// Fixed seeds keep SSR/hydration identical and avoid a visible tiled rain pattern.
const drops = Array.from({ length: 28 }, (_, index) => ({
  left: (index * 37.7 + 5.3) % 108 - 4,
  delay: -((index * .731) % 3.2),
  duration: 2.2 + ((index * .173) % 1.2),
  length: 48 + ((index * 19) % 72),
}));

export function RubySanctuaryWeather() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const syncVisibility = () => root.current?.toggleAttribute("data-paused", document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  return <div ref={root} className={styles.weather} data-testid="ruby-weather" aria-hidden="true">
    <div className={styles.bloom} />
    <div className={styles.rain}>{drops.map((drop, index) => <i key={index} style={{
      "--rain-left": `${drop.left}%`, "--rain-delay": `${drop.delay}s`,
      "--rain-duration": `${drop.duration}s`, "--rain-length": `${drop.length}px`,
    } as CSSProperties} />)}</div>
  </div>;
}
