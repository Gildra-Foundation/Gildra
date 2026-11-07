"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, Columns2, Hourglass } from "lucide-react";
import type { AtlasEra, AtlasEvent, Lang } from "@/lib/wow/worldMap/bundle";
import { EXPANSIONS, worldMapCopy } from "./worldMapCopy";
import { eraAt, patchPosition, restOf } from "./worldMapModel";
import styles from "./worldMapViewer.module.css";

const SPAN = EXPANSIONS.length;
const pct = (position: number) => `${(Math.max(0, Math.min(SPAN, position)) / SPAN) * 100}%`;

/**
 * The timeline under the map: eras as chips and bands, expansions as ticks,
 * world events as runes; the thumb scrubs through time and the map follows.
 */
export function MapTimeline({ lang, eras, events, position, activeEvent, compare, canCompare, onPosition, onEvent, onCompare }: {
  lang: Lang; eras: AtlasEra[]; events: AtlasEvent[]; position: number; activeEvent: AtlasEvent | null;
  compare: boolean; canCompare: boolean;
  onPosition(position: number): void; onEvent(event: AtlasEvent): void; onCompare(): void;
}) {
  const copy = worldMapCopy[lang];
  const track = useRef<HTMLDivElement>(null);
  const [peek, setPeek] = useState<AtlasEvent | null>(null);
  const dragging = useRef(false);
  const era = eraAt(eras, position);
  const time = position;

  const positionAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect) return time;
    return Math.max(0, Math.min(SPAN - 0.001, ((clientX - rect.left) / rect.width) * SPAN));
  };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-event-rune]")) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onPosition(positionAt(event.clientX));
  };
  const move = (event: PointerEvent<HTMLDivElement>) => { if (dragging.current) onPosition(positionAt(event.clientX)); };
  const up = () => { dragging.current = false; };
  const eraIndex = eras.findIndex((entry) => entry.id === era?.id);
  const goEra = (i: number) => { const next = eras[Math.max(0, Math.min(eras.length - 1, i))]; if (next) onPosition(restOf(eras, next)); };
  const step = (delta: number) => goEra(eraIndex + delta);
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); step(-1); }
    if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); step(1); }
    if (event.key === "Home") { event.preventDefault(); goEra(0); }
    if (event.key === "End") { event.preventDefault(); goEra(eras.length - 1); }
  };
  const nowLabel = era ? `${era.name} · ${EXPANSIONS[Math.min(SPAN - 1, Math.floor(time))]?.name ?? ""}` : "";

  return (
    <div className={styles.timeline} data-map-ui>
      <div className={styles.eraRow}>
        <Hourglass aria-hidden="true" className={styles.eraIcon} />
        <p className={styles.eraNow} aria-live="polite">
          <span className={styles.eraName}>{era?.name}</span>
          {era?.years ? <span className={styles.eraYears}>{era.years[0] === era.years[1] ? era.years[0] : `${era.years[0]}–${era.years[1]}`}</span> : null}
        </p>
        <span className={styles.eraStep}>
          <button type="button" aria-label={copy.earlier} disabled={eraIndex <= 0} onClick={() => step(-1)}><ChevronLeft aria-hidden="true" /></button>
          <button type="button" aria-label={copy.later} disabled={eraIndex >= eras.length - 1} onClick={() => step(1)}><ChevronRight aria-hidden="true" /></button>
        </span>
        {canCompare || compare ? (
          <button type="button" className={styles.compareButton} aria-pressed={compare} onClick={onCompare}>
            <Columns2 aria-hidden="true" />
            <span>{compare ? copy.compareOff : copy.compare}</span>
          </button>
        ) : null}
      </div>
      <div className={styles.track} ref={track} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className={styles.rail} aria-hidden="true" />
        {eras.map((entry) => (
          <span key={entry.id} aria-hidden="true" className={styles.band} data-active={entry.id === era?.id ? "" : undefined}
            style={{ left: pct(patchPosition(entry.range[0])), width: `calc(${pct(Math.min(SPAN, patchPosition(entry.range[1]) + 0.45))} - ${pct(patchPosition(entry.range[0]))})`, ...(entry.accent ? { ["--era-accent" as string]: entry.accent } : {}) }} />
        ))}
        <ol className={styles.ticks}>
          {EXPANSIONS.map((expansion) => {
            const target = eraAt(eras, expansion.major - 1 + 0.05);
            return (
              <li key={expansion.id} style={{ left: pct(expansion.major - 1) }} data-wide={expansion.major % 2 === 0 ? undefined : ""}>
                <button type="button" tabIndex={-1} data-event-rune aria-hidden="true" data-active={target?.id === era?.id ? "" : undefined}
                  onClick={() => { if (target) onPosition(restOf(eras, target)); }}>{expansion.short}</button>
              </li>
            );
          })}
        </ol>
        {events.map((event) => (
          <button key={event.id} type="button" data-event-rune className={styles.rune} data-active={event.id === activeEvent?.id ? "" : undefined}
            style={{ left: pct(patchPosition(event.patch)) }}
            aria-label={`${event.title}, ${copy.patch} ${event.patch}`}
            onPointerEnter={() => setPeek(event)} onPointerLeave={() => setPeek((current) => (current?.id === event.id ? null : current))}
            onFocus={() => setPeek(event)} onBlur={() => setPeek(null)}
            onClick={() => onEvent(event)}>
            <span aria-hidden="true" />
          </button>
        ))}
        <div className={styles.thumb} role="slider" tabIndex={0} aria-label={copy.timeline}
          aria-valuemin={0} aria-valuemax={SPAN} aria-valuenow={Math.round(time * 10) / 10} aria-valuetext={nowLabel}
          style={{ left: pct(time) }} onKeyDown={key} />
        {peek ? (
          <div className={styles.peek} role="tooltip" style={{ left: `clamp(120px, ${pct(patchPosition(peek.patch))}, calc(100% - 120px))` }}>
            <strong>{peek.title}</strong>
            <span className={styles.peekMeta}>{copy.patch} {peek.patch}{peek.year ? ` · ${peek.year}` : ""}</span>
            <span>{peek.summary}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
