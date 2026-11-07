"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import type { Lang } from "@/lib/wow/worldMap/bundle";
import { worldMapCopy } from "./worldMapCopy";
import styles from "./worldMap.module.css";

/**
 * The map's stage, rendered on the server: the first picture as plain tiles,
 * the title and the trail. The interactive viewer (WebGL, panels, timeline) is
 * a separate chunk loaded after the page shows; it takes the same stage over.
 */
export type StageCrumb = { label: string; href?: string; mapId?: number };
export type StagePoster = { aspect: number; tiles: Array<{ src: string; left: number; top: number; width: number; height: number }> };
export type StageHandle = {
  setTitle(title: string, line: string): void;
  setCrumbs(crumbs: StageCrumb[]): void;
  onCrumb(handler: ((mapId: number) => void) | null): void;
  ready(): void;
  setFull(full: boolean): void;
  setSearchTop(px: number): void;
};

const WorldMapViewer = dynamic(() => import("./WorldMapViewer"), { ssr: false });

export function WorldMapStage({ lang, mapId, homeId, title, line, crumbs, poster, bundleUrl }: {
  lang: Lang; mapId: number | null; homeId: number | null; title: string; line: string;
  crumbs: StageCrumb[]; poster: StagePoster | null; bundleUrl: string;
}) {
  const stage = useRef<HTMLElement>(null);
  const [heading, setHeading] = useState({ title, line });
  const [trail, setTrail] = useState(crumbs);
  const [live, setLive] = useState(false);
  const [start, setStart] = useState(false);
  const [full, setFull] = useState(false);
  const [searchTop, setSearchTop] = useState<number | null>(null);
  const crumbHandler = useRef<((mapId: number) => void) | null>(null);

  // The stage fills the first screen below whatever sits above it (version strip, top bar).
  const [topOffset, setTopOffset] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = stage.current;
    if (el) setTopOffset(Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY)));
  }, []);

  // The viewer chunk loads once the first picture is on screen.
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = idle ? idle(() => setStart(true), { timeout: 900 }) : window.setTimeout(() => setStart(true), 200);
    return () => { if (!idle) window.clearTimeout(id); };
  }, []);

  const handle = useRef<StageHandle>({
    setTitle: (t, l) => setHeading({ title: t, line: l }),
    setCrumbs: (c) => setTrail(c),
    onCrumb: (h) => { crumbHandler.current = h; },
    ready: () => setLive(true),
    setFull: (value) => setFull(value),
    setSearchTop: (px) => setSearchTop(px),
  });

  const crumbClick = useCallback((event: MouseEvent<HTMLAnchorElement>, crumb: StageCrumb) => {
    if (crumb.mapId === undefined || !crumbHandler.current || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    crumbHandler.current(crumb.mapId);
  }, []);

  return (
    <section ref={stage} className={styles.stage} data-map-stage data-live={live ? "" : undefined} data-full={full ? "" : undefined}
      style={{ ...(searchTop === null ? {} : { ["--map-search-top" as string]: `${searchTop}px` }), ...(topOffset === null ? {} : { ["--map-top-offset" as string]: `${topOffset}px` }) }} aria-labelledby="world-map-title">
      {poster ? (
        <div className={styles.poster} aria-hidden="true">
          <div className={styles.posterArt} style={{ aspectRatio: poster.aspect, ["--poster-aspect" as string]: poster.aspect }}>
            {poster.tiles.map((tile) => (
              // eslint-disable-next-line @next/next/no-img-element -- map tiles: exact pixel grid, no optimizer
              <img key={tile.src} src={tile.src} alt="" decoding="async" fetchPriority="high" draggable={false}
                style={{ left: `${tile.left * 100}%`, top: `${tile.top * 100}%`, width: `${tile.width * 100}%`, height: `${tile.height * 100}%` }} />
            ))}
          </div>
        </div>
      ) : null}
      <div className={styles.vignette} aria-hidden="true" />
      <header className={styles.titleBar} data-map-ui>
        <nav aria-label={worldMapCopy[lang].trail} className={styles.trail}>
          <ol>
            {trail.map((crumb, index) => {
              const last = index === trail.length - 1;
              return (
                <li key={`${crumb.label}-${index}`}>
                  {crumb.href && !last
                    ? <a href={crumb.href} onClick={(event) => crumbClick(event, crumb)}>{crumb.label}</a>
                    : <span aria-current={last ? "page" : undefined}>{crumb.label}</span>}
                  {last ? null : <ChevronRight aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </nav>
        <h1 id="world-map-title" className={styles.title}>{heading.title}</h1>
        {heading.line ? <p className={styles.line}>{heading.line}</p> : null}
      </header>
      {start ? <WorldMapViewer stage={stage} handle={handle} lang={lang} mapId={mapId} homeId={homeId} bundleUrl={bundleUrl} /> : null}
    </section>
  );
}
