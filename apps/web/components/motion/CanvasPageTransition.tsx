"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { HomeThemeId } from "../platform/home/homeThemes";
import { lessMotion, subscribeSiteMotion } from "@/lib/client/motionPreference";
import { iceCrackSound } from "./iceCrackSound";
import { iceFracture, ICE_FREEZE_MS, ICE_CRACK_MS, ICE_RELEASE_MS } from "./iceFracture";
import { iceMaterial, warmIceMaterial } from "./iceMaterial";
import { transitionSnapshot } from "./transitionSnapshot";
import styles from "./canvasTransition.module.css";

export type PageTransitionHandle = {
  start: (frame: HTMLElement, theme: HomeThemeId) => void;
  reveal: () => boolean;
  cancel: () => void;
};

/** One outgoing DOM copy, one bounded canvas; routing proceeds underneath. */
export function CanvasPageTransition({ ref }: { ref: Ref<PageTransitionHandle> }) {
  const host = useRef<HTMLDivElement>(null);
  const active = useRef(false), destinationReady = useRef(false), cracksReady = useRef(false), revealing = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const animationFrame = useRef(0);
  const surface = useRef<ReturnType<typeof iceMaterial> | null>(null);
  const stopSound = useRef<(() => void) | undefined>(undefined);

  function cancel() {
    cancelAnimationFrame(animationFrame.current);
    timers.current.forEach(clearTimeout); timers.current = [];
    stopSound.current?.(); stopSound.current = undefined;
    surface.current?.dispose(); surface.current = null;
    host.current?.replaceChildren();
    if (host.current) delete host.current.dataset.phase;
    delete document.documentElement.dataset.pageTransition;
    active.current = false; revealing.current = false; destinationReady.current = false; cracksReady.current = false;
  }
  function animate(phase: "freezing" | "cracking" | "shattering", duration: number, complete: () => void) {
    const origin = performance.now();
    surface.current?.draw(phase, 0);
    const tick = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - origin) / duration));
      surface.current?.draw(phase, progress);
      if (progress < 1) animationFrame.current = requestAnimationFrame(tick);
      else complete();
    };
    animationFrame.current = requestAnimationFrame(tick);
  }
  function shatter() {
    if (!destinationReady.current || !cracksReady.current || revealing.current || !host.current) return;
    revealing.current = true;
    host.current.dataset.phase = "shattering";
    if (surface.current) animate("shattering", ICE_RELEASE_MS, () => {});
    timers.current.push(setTimeout(cancel, surface.current ? ICE_RELEASE_MS : 760));
  }
  useImperativeHandle(ref, () => ({
    cancel,
    start(frame, theme) {
      cancel();
      if (lessMotion() || !host.current) return;
      const root = host.current;
      const piece = document.createElement("div");
      piece.className = styles.outgoing;
      piece.dataset.transitionSnapshot = "";
      piece.append(transitionSnapshot(frame, styles.frozen));
      root.dataset.effect = theme; root.dataset.phase = "freezing";
      document.documentElement.dataset.pageTransition = theme;
      root.append(piece);
      const ice = theme === "arthas";
      if (ice) {
        surface.current = iceMaterial(innerWidth, innerHeight, iceFracture(innerWidth, innerHeight));
        surface.current.canvas.className = styles.surface;
        root.append(surface.current.canvas);
        stopSound.current = iceCrackSound(ICE_FREEZE_MS / 1000);
      }
      active.current = true;
      const crack = () => {
        root.dataset.phase = "cracking";
        const ready = () => { cracksReady.current = true; shatter(); };
        if (ice) animate("cracking", ICE_CRACK_MS, ready);
        else timers.current.push(setTimeout(ready, 220));
      };
      if (ice) animate("freezing", ICE_FREEZE_MS, crack);
      else timers.current.push(setTimeout(crack, 340));
      timers.current.push(setTimeout(cancel, 12000));
    },
    reveal() {
      if (!active.current || !host.current) return false;
      if (lessMotion()) { cancel(); return false; }
      destinationReady.current = true; shatter(); return true;
    },
  }));
  useEffect(() => {
    // Prepare only the selected frost material, after critical resources load.
    let idle: number | undefined;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => { if (lessMotion()) cancel(); };
    motion.addEventListener("change", changed);
    const unsubscribe = subscribeSiteMotion(changed);
    const warm = () => {
      if (document.hidden || lessMotion() || document.documentElement.dataset.siteTheme !== "arthas") return;
      if (window.requestIdleCallback) idle = window.requestIdleCallback(() => { if (!lessMotion() && !document.hidden) warmIceMaterial(); }, { timeout: 4000 });
      else idle = window.setTimeout(warmIceMaterial, 1500);
    };
    if (document.readyState === "complete") warm();
    else window.addEventListener("load", warm, { once: true });
    window.addEventListener("resize", cancel);
    return () => {
      window.removeEventListener("load", warm); window.removeEventListener("resize", cancel);
      if (idle !== undefined) { window.cancelIdleCallback?.(idle); clearTimeout(idle); }
      motion.removeEventListener("change", changed); unsubscribe();
      cancel();
    };
  }, []);
  return <div ref={host} className={styles.host} data-themed-transition aria-hidden="true" inert />;
}
