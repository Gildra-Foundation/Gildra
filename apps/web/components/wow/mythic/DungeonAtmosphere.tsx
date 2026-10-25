"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import styles from "./dungeonAtmosphere.module.css";

type Kind = "rain" | "mist" | "snow" | "pollen" | "void" | "souls" | "sand";
const particles = Array.from({ length: 36 }, (_, i) => ({
  x: (i * 37.7 + 5.3) % 100, y: (i * 23.9 + 7.1) % 100,
  delay: -((i * 1.731) % 16), duration: 12 + (i * 1.173) % 12, size: 2 + i % 4,
}));

/** Decorative atmosphere stays behind the page; no frame loop or interactive overlay. */
export function DungeonAtmosphere({ kind }: { kind: Kind }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sync = () => root.current?.toggleAttribute("data-paused", document.hidden);
    sync(); document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return <div ref={root} className={styles.atmosphere} data-atmosphere={kind} aria-hidden="true">
    <div className={styles.bloom} /><div className={styles.mist} data-weather-mist />
    <div className={styles.particles} data-weather-particles>{particles.map((p, i) => <i key={i} style={{
      "--particle-x": `${p.x}%`, "--particle-y": `${p.y}%`, "--particle-delay": `${p.delay}s`,
      "--particle-duration": `${p.duration}s`, "--particle-size": `${p.size}px`,
    } as CSSProperties} />)}</div>
  </div>;
}
