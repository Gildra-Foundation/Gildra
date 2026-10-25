"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import styles from "./raidHubBackdrop.module.css";

// Stable seeds keep the server painting and hydrated atmosphere identical.
const motes = Array.from({ length: 18 }, (_, index) => ({
  x: 5 + (index * 19.37) % 90,
  y: 4 + (index * 27.13) % 92,
  delay: -((index * 2.193) % 19),
  duration: 17 + (index * 1.419) % 15,
  size: index % 5 === 0 ? 3 : 2,
}));

/** The approved vault and its painted ravine continue below the hub's real HTML. */
export function RaidHubBackdrop() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncVisibility = () => root.current?.toggleAttribute("data-paused", document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  return (
    <div ref={root} className={styles.backdrop} aria-hidden="true" data-raid-hub-backdrop>
      <div className={styles.continuation} data-raid-hub-continuation>
        <picture>
          <source media="(max-width: 767px)" srcSet="/assets/wow/raids/hub/polish/continuation-mobile.webp" width="576" height="1600" />
          <source media="(max-width: 1023px)" srcSet="/assets/wow/raids/hub/polish/continuation-tablet.webp" width="768" height="1280" />
          <img src="/assets/wow/raids/hub/polish/continuation.webp" width="971" height="1619" alt="" loading="lazy" fetchPriority="low" decoding="async" />
        </picture>
      </div>
      <div className={styles.scene} data-raid-hub-scene>
        <picture>
          <source media="(max-width: 767px)" srcSet="/assets/wow/raids/hub/vault-mobile.webp" width="640" height="1000" />
          <source media="(max-width: 1023px)" srcSet="/assets/wow/raids/hub/vault-tablet.webp" width="768" height="760" />
          {/* The browser selects one finished crop; there is no duplicate art preload. */}
          <img src="/assets/wow/raids/hub/vault.webp" width="1672" height="941" alt="" loading="eager" fetchPriority="high" decoding="async" />
        </picture>
        <div className={styles.vaultLight} data-raid-vault-light />
      </div>
      <div className={styles.atmosphere} data-raid-hub-mist><i /><i /></div>
      <div className={styles.motes} data-raid-hub-motes>
        {motes.map((mote, index) => <i key={index} style={{
          "--mote-x": `${mote.x}%`, "--mote-y": `${mote.y}%`,
          "--mote-delay": `${mote.delay}s`, "--mote-duration": `${mote.duration}s`,
          "--mote-size": `${mote.size}px`,
        } as CSSProperties} />)}
      </div>
    </div>
  );
}
