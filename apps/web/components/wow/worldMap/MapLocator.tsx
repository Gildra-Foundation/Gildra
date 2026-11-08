"use client";

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { Map as MapIcon, Minimize2 } from "lucide-react";
import type { AtlasMap, Lang } from "@/lib/wow/worldMap/bundle";
import type { Box } from "./engine/camera";
import { levelSize, levelTiles, tileUrl } from "./engine/tiles";
import { worldMapCopy } from "./worldMapCopy";
import styles from "./ui/mapChrome.module.css";

/** Width of the inset in CSS px (the art level is picked for twice that: sharp on DPR 2). */
const WIDTH = 148;
/** The reader's choice: the inset open or folded (folded by default — the map's own art comes first). */
const OPEN_KEY = "gildra.worldMap.overview";
const readOpen = () => { try { return window.localStorage.getItem(OPEN_KEY) === "1"; } catch { return false; } };

/**
 * The overview inset: the continent (or world) around the place in view, the
 * place lit on it and the part of the map on screen as a frame. A click flies
 * to that spot of the continent. The frame follows the camera through
 * `followRef` — written by the viewer on each drawn frame, outside React.
 * It folds to a small button so it never hides the painted title in the
 * map's corner; the choice is kept for the next visit.
 */
export function MapLocator({ lang, map, here, followRef, onPick }: {
  lang: Lang; map: AtlasMap; here: AtlasMap;
  followRef: RefObject<((view: Box) => void) | null>;
  onPick(mapId: number, x: number, y: number): void;
}) {
  const copy = worldMapCopy[lang];
  const view = useRef<SVGRectElement>(null);
  const [open, setOpen] = useState(readOpen);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { window.localStorage.setItem(OPEN_KEY, next ? "1" : "0"); } catch { /* the choice lasts this visit */ }
  };
  const art = map.art;
  const aspect = art ? art.width / art.height : 1.5;
  const tiles = (() => {
    if (!art) return [];
    let z = 0;
    while (z < art.maxZoom && levelSize(art, z)[0] < WIDTH * 2) z += 1;
    const [lw, lh] = levelSize(art, z);
    const [cols, rows] = levelTiles(art, z);
    const out: Array<{ src: string; left: number; top: number; width: number; height: number }> = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      out.push({ src: tileUrl(art, map.id, z, x, y), left: (x * art.tileSize) / lw, top: (y * art.tileSize) / lh, width: art.tileSize / lw, height: art.tileSize / lh });
    }
    return out;
  })();
  const [f0, f1, f2, f3] = map.frame;
  const fw = f2 - f0, fh = f3 - f1;
  const lit = { x: (here.frame[0] - f0) / fw, y: (here.frame[1] - f1) / fh, w: (here.frame[2] - here.frame[0]) / fw, h: (here.frame[3] - here.frame[1]) / fh };

  useEffect(() => {
    followRef.current = (box) => {
      const rect = view.current;
      if (!rect) return;
      // Clipped to the inset: a view wider than the continent draws its edge, not beyond.
      const x0 = Math.max(0, (box[0] - f0) / fw), y0 = Math.max(0, (box[1] - f1) / fh);
      const x1 = Math.min(1, (box[2] - f0) / fw), y1 = Math.min(1, (box[3] - f1) / fh);
      const shown = x1 > x0 && y1 > y0;
      rect.setAttribute("visibility", shown ? "visible" : "hidden");
      if (!shown) return;
      rect.setAttribute("x", x0.toFixed(4));
      rect.setAttribute("y", y0.toFixed(4));
      rect.setAttribute("width", (x1 - x0).toFixed(4));
      rect.setAttribute("height", (y1 - y0).toFixed(4));
    };
    return () => { followRef.current = null; };
  }, [followRef, f0, f1, fw, fh, open]);

  const pick = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    // A keyboard press (no pointer position) opens the continent whole.
    const keyboard = event.detail === 0;
    onPick(map.id, keyboard ? 0.5 : (event.clientX - rect.left) / rect.width, keyboard ? 0.5 : (event.clientY - rect.top) / rect.height);
  };

  if (!art) return null;
  // Re-keyed when it folds: the viewer's stage observer sees the corner change and fits the map again.
  return (
    <div key={open ? "open" : "folded"} className={styles.locatorDock} data-map-ui data-map-locator>
      {open ? (
        <button type="button" className={styles.locator} onClick={pick} aria-label={`${copy.overview}: ${map.name}`} title={map.name}>
          <span className={styles.locatorArt} style={{ aspectRatio: aspect }}>
            {tiles.map((tile) => (
              // eslint-disable-next-line @next/next/no-img-element -- map tiles: exact pixel grid, no optimizer
              <img key={tile.src} src={tile.src} alt="" draggable={false} decoding="async" loading="lazy"
                style={{ left: `${tile.left * 100}%`, top: `${tile.top * 100}%`, width: `calc(${tile.width * 100}% + 1px)`, height: `calc(${tile.height * 100}% + 1px)` }} />
            ))}
            <svg className={styles.locatorMarks} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
              {map.id !== here.id ? <rect className={styles.locatorHere} x={lit.x} y={lit.y} width={lit.w} height={lit.h} /> : null}
              <rect ref={view} className={styles.locatorView} x="0" y="0" width="1" height="1" visibility="hidden" />
            </svg>
          </span>
        </button>
      ) : null}
      <button type="button" className={styles.locatorToggle} aria-expanded={open} onClick={toggle}
        aria-label={open ? copy.hideOverview : copy.showOverview} title={open ? copy.hideOverview : copy.showOverview}>
        {open ? <Minimize2 aria-hidden="true" /> : <MapIcon aria-hidden="true" />}
      </button>
    </div>
  );
}
