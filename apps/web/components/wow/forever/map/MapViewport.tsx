"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/i18n-paths";
import { mapCopy } from "./mapCopy";
import styles from "./map.module.css";

export function MapViewport({ src, width, height, viewBox, label, lang, children, activePoint }: {
  src: string; width?: number; height?: number; viewBox?: string; label: string; lang: Lang; children?: ReactNode; activePoint?: { x: number; y: number };
}) {
  const t = mapCopy[lang];
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const probe = new Image();
    probe.onload = () => setState("ready");
    probe.onerror = () => setState("error");
    probe.src = src;
    return () => { probe.onload = null; probe.onerror = null; };
  }, [src, attempt]);
  const pointX = activePoint?.x;
  const pointY = activePoint?.y;
  useEffect(() => {
    const element = viewport.current;
    if (!element || pointX === undefined || pointY === undefined || state !== "ready") return;
    let frame = 0;
    const center = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => element.scrollTo({ left: element.scrollWidth * pointX / 100 - element.clientWidth / 2, top: element.scrollHeight * pointY / 100 - element.clientHeight / 2, behavior: "instant" }));
    };
    center();
    window.addEventListener("hashchange", center);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", center); };
  }, [pointX, pointY, state]);
  function changeZoom(next: number, reset = false) {
    const element = viewport.current;
    const value = Math.max(1, Math.min(4, next));
    const ratio = value / zoom;
    const left = element && !reset ? (element.scrollLeft + element.clientWidth / 2) * ratio - element.clientWidth / 2 : 0;
    const top = element && !reset ? (element.scrollTop + element.clientHeight / 2) * ratio - element.clientHeight / 2 : 0;
    setZoom(value);
    requestAnimationFrame(() => element?.scrollTo({ left, top, behavior: "instant" }));
  }
  return <div className={styles.root}>
    <div className={styles.controls}>
      <button type="button" aria-label={t.zoomOut} disabled={zoom === 1} onClick={() => changeZoom(zoom - .5)}>−</button>
      <button type="button" aria-label={t.zoomIn} disabled={zoom === 4} onClick={() => changeZoom(zoom + .5)}>+</button>
      <button type="button" onClick={() => changeZoom(1, true)}>{t.reset}</button>
      <a href={src} target="_blank" rel="noreferrer">{t.original} ↗</a>
    </div>
    {state !== "ready" && <div className={styles.status} role="status">{state === "loading" ? t.loading : <>{t.error} <button type="button" onClick={() => { setState("loading"); setAttempt(value => value + 1); }}>{t.retry}</button></>}</div>}
    <div ref={viewport} className={styles.viewport} tabIndex={0} role="region" aria-label={label}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "+" || event.key === "=") { event.preventDefault(); changeZoom(zoom + .5); }
        if (event.key === "-") { event.preventDefault(); changeZoom(zoom - .5); }
        if (event.key === "0") { event.preventDefault(); changeZoom(1, true); }
      }}
      onPointerDown={event => {
        if (event.pointerType !== "mouse" || event.button !== 0 || (event.target as HTMLElement).closest("a,button")) return;
        drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => { if (drag.current) { event.currentTarget.scrollLeft = drag.current.left + drag.current.x - event.clientX; event.currentTarget.scrollTop = drag.current.top + drag.current.y - event.clientY; } }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
      <div className={styles.canvas} style={{ width: `${zoom * 100}%` }}>
        {viewBox ? <svg viewBox={viewBox} role="img" aria-label={label}><image key={attempt} href={src} width="2048" height="2048" onLoad={() => setState("ready")} onError={() => setState("error")} /></svg> :
          /* eslint-disable-next-line @next/next/no-img-element */
          <img key={attempt} src={src} width={width} height={height} alt={label} draggable={false} onLoad={() => setState("ready")} onError={() => setState("error")} />}
        {state === "ready" && children}
      </div>
    </div>
  </div>;
}
