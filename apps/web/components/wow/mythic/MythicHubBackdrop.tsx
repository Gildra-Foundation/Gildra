"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import styles from "./mythicHubBackdrop.module.css";

// Fixed seeds give SSR and hydration the same sparse, untiled atmosphere.
const motes = Array.from({ length: 18 }, (_, index) => ({
  x: 45 + (index * 17.73) % 53,
  y: 12 + (index * 23.91) % 70,
  delay: -((index * 1.731) % 16),
  duration: 15 + (index * 1.173) % 12,
  size: index % 4 === 0 ? 3 : 2,
}));

/** One responsive painting, fading into the same page. Never covers page controls. */
export function MythicHubBackdrop() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncVisibility = () => root.current?.toggleAttribute("data-paused", document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  return (
    <div ref={root} className={styles.backdrop} aria-hidden="true" data-mythic-hub-backdrop>
      <div className={styles.continuation} />
      <div className={styles.scene}>
        <picture>
          <source media="(max-width: 767px)" srcSet="/assets/wow/mythic/hub/gateway-mobile.webp" width="640" height="1000" />
          <source media="(max-width: 1023px)" srcSet="/assets/wow/mythic/hub/gateway-768.webp" width="768" height="432" />
          {/* A picture chooses exactly one pre-encoded background, with no second optimizer request. */}
          <img src="/assets/wow/mythic/hub/gateway.webp" width="1672" height="941" alt="" loading="eager" fetchPriority="high" decoding="async" />
        </picture>
        <div className={styles.portalLight} data-hub-portal-light />
        <div className={styles.motes} data-hub-motes>
          {motes.map((mote, index) => <i key={index} style={{
            "--mote-x": `${mote.x}%`, "--mote-y": `${mote.y}%`,
            "--mote-delay": `${mote.delay}s`, "--mote-duration": `${mote.duration}s`,
            "--mote-size": `${mote.size}px`,
          } as CSSProperties} />)}
        </div>
      </div>
    </div>
  );
}
