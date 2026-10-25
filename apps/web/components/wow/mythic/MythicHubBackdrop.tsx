"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { lessMotion } from "@gildra/atlas-ui/motionPreference";
import styles from "./mythicHubBackdrop.module.css";

// Stable seeds keep the server painting and hydrated atmosphere identical.
const motes = Array.from({ length: 18 }, (_, index) => ({
  x: 5 + (index * 19.37) % 90,
  y: 4 + (index * 27.13) % 92,
  delay: -((index * 2.193) % 19),
  duration: 17 + (index * 1.419) % 15,
  size: index % 5 === 0 ? 3 : 2,
}));

const rain = Array.from({ length: 16 }, (_, index) => ({
  x: 3 + (index * 23.71) % 96,
  delay: -((index * .783) % 5),
  duration: 3.8 + (index % 5) * .35,
  length: 30 + (index % 4) * 10,
}));

/** The approved gateway and its painted ravine continue below the hub's real HTML. */
export function MythicHubBackdrop() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let disposed = false;
    let visible = false;
    let sceneVisible = false;
    const scene = element.querySelector("[data-mythic-hub-scene]");
    const preferences = [
      window.matchMedia("(prefers-reduced-motion: reduce)"),
      window.matchMedia("(prefers-reduced-transparency: reduce)"),
      window.matchMedia("(forced-colors: active)"),
    ];
    const syncAtmosphere = () => {
      if (disposed) return;
      const reduced = lessMotion() || preferences.some(query => query.matches)
        || !!element.closest('[data-ui-motion="reduce"], [data-transparency="reduced"]');
      const active = visible && !document.hidden && !reduced;
      element.toggleAttribute("data-atmosphere-active", active);
      element.toggleAttribute("data-bloom-active", active && sceneVisible);
      element.toggleAttribute("data-paused", !active);
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.target === element) visible = entry.isIntersecting;
        if (entry.target === scene) sceneVisible = entry.isIntersecting;
      }
      syncAtmosphere();
    });
    observer?.observe(element);
    if (scene) observer?.observe(scene);
    const attributes = new MutationObserver(syncAtmosphere);
    attributes.observe(document.documentElement, {
      attributes: true, subtree: true,
      attributeFilter: ["data-motion", "data-ui-motion", "data-transparency"],
    });
    for (const query of preferences) query.addEventListener("change", syncAtmosphere);
    document.addEventListener("visibilitychange", syncAtmosphere);
    syncAtmosphere();
    return () => {
      disposed = true;
      observer?.disconnect();
      attributes.disconnect();
      for (const query of preferences) query.removeEventListener("change", syncAtmosphere);
      document.removeEventListener("visibilitychange", syncAtmosphere);
      element.removeAttribute("data-atmosphere-active");
      element.removeAttribute("data-bloom-active");
      element.removeAttribute("data-paused");
    };
  }, []);

  return (
    <div ref={root} className={styles.backdrop} aria-hidden="true" data-mythic-hub-backdrop>
      <div className={styles.continuation} data-mythic-hub-continuation>
        <picture>
          <source media="(max-width: 767px)" srcSet="/assets/wow/mythic/hub/continuation-mobile.webp" width="576" height="1600" />
          <source media="(max-width: 1023px)" srcSet="/assets/wow/mythic/hub/continuation-tablet.webp" width="768" height="1280" />
          <img src="/assets/wow/mythic/hub/continuation.webp" width="971" height="1619" alt="" loading="lazy" fetchPriority="low" decoding="async" />
        </picture>
      </div>
      <div className={styles.scene} data-mythic-hub-scene>
        <picture>
          <source media="(max-width: 767px)" srcSet="/assets/wow/mythic/hub/gateway-mobile.webp" width="640" height="1000" />
          <source media="(max-width: 1023px)" srcSet="/assets/wow/mythic/hub/gateway-768.webp" width="768" height="432" />
          {/* The browser selects one finished crop; there is no duplicate art preload. */}
          <img src="/assets/wow/mythic/hub/gateway.webp" width="1672" height="941" alt="" loading="eager" fetchPriority="high" decoding="async" />
        </picture>
        <div className={styles.portalLight} data-mythic-portal-light data-hub-portal-light data-mythic-portal-bloom="cold" />
        <div className={styles.warmLight} data-mythic-portal-bloom="amber" />
      </div>
      <div className={styles.rain} data-mythic-hub-rain>
        {rain.map((drop, index) => <i key={index} style={{
          "--rain-x": `${drop.x}%`, "--rain-delay": `${drop.delay}s`,
          "--rain-duration": `${drop.duration}s`, "--rain-length": `${drop.length}px`,
        } as CSSProperties} />)}
      </div>
      <div className={styles.atmosphere} data-mythic-hub-mist><i /><i /></div>
      <div className={styles.motes} data-mythic-hub-motes data-hub-motes>
        {motes.map((mote, index) => <i key={index} style={{
          "--mote-x": `${mote.x}%`, "--mote-y": `${mote.y}%`,
          "--mote-delay": `${mote.delay}s`, "--mote-duration": `${mote.duration}s`,
          "--mote-size": `${mote.size}px`,
        } as CSSProperties} />)}
      </div>
    </div>
  );
}
