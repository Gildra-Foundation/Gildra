"use client";

import { useEffect, useRef } from "react";
import { ChevronUp, Expand, Layers as LayersIcon, Minus, Plus, Scan, Shrink } from "lucide-react";
import type { Lang } from "@/lib/wow/worldMap/bundle";
import type { Layers } from "../mapMarkers";
import { worldMapCopy } from "../worldMapCopy";
import styles from "../worldMapViewer.module.css";

const LAYER_KEYS: Array<keyof Layers> = ["cities", "instances", "flight", "portals", "events", "labels", "alive"];

/** The map's tools on the right edge: zoom as one pair, the map whole, a level up, the layers menu and full screen. */
export function MapControls({ lang, canUp, full, layers, layersOpen, onZoom, onWhole, onUp, onLayersOpen, onLayers, onFull }: {
  lang: Lang; canUp: boolean; full: boolean; layers: Layers; layersOpen: boolean;
  onZoom(factor: number): void; onWhole(): void; onUp(): void; onLayersOpen(open: boolean): void; onLayers(next: Layers): void; onFull(): void;
}) {
  const copy = worldMapCopy[lang];
  const menu = useRef<HTMLFieldSetElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  // The layers menu closes on a click elsewhere and on Escape (focus goes back to its button).
  useEffect(() => {
    if (!layersOpen) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !toggle.current?.contains(target)) onLayersOpen(false);
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onLayersOpen(false); toggle.current?.focus(); } };
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", key, true); };
  }, [layersOpen, onLayersOpen]);

  return (
    <>
      <div className={styles.controls} data-map-ui>
        <div className={styles.controlGroup} role="group" aria-label={copy.zoom}>
          <button type="button" onClick={() => onZoom(1.8)} aria-label={copy.zoomIn} title={copy.zoomIn}><Plus aria-hidden="true" /></button>
          <button type="button" onClick={() => onZoom(1 / 1.8)} aria-label={copy.zoomOut} title={copy.zoomOut}><Minus aria-hidden="true" /></button>
        </div>
        <button type="button" onClick={onWhole} aria-label={copy.whole} title={copy.whole}><Scan aria-hidden="true" /></button>
        <button type="button" data-up="" onClick={onUp} aria-label={copy.up} title={copy.up} disabled={!canUp}><ChevronUp aria-hidden="true" /></button>
        <button ref={toggle} type="button" onClick={() => onLayersOpen(!layersOpen)} aria-label={copy.layers} title={copy.layers} aria-expanded={layersOpen} aria-controls="world-map-layers"><LayersIcon aria-hidden="true" /></button>
        <button type="button" onClick={onFull} aria-label={full ? copy.exitFullscreen : copy.fullscreen} title={full ? copy.exitFullscreen : copy.fullscreen} aria-pressed={full}>{full ? <Shrink aria-hidden="true" /> : <Expand aria-hidden="true" />}</button>
      </div>
      {layersOpen ? (
        <fieldset ref={menu} id="world-map-layers" className={styles.layers} data-map-ui>
          <legend>{copy.layers}</legend>
          {LAYER_KEYS.map((key) => (
            <label key={key}>
              <input type="checkbox" checked={layers[key]} onChange={(e) => onLayers({ ...layers, [key]: e.target.checked })} />
              <span>{copy.layer[key]}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
    </>
  );
}
