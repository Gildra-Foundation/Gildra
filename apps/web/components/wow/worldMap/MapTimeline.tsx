"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Columns2, Hourglass } from "lucide-react";
import type { AtlasEra, AtlasEvent, Lang } from "@/lib/wow/worldMap/bundle";
import { EXPANSIONS, worldMapCopy } from "./worldMapCopy";
import { eraAt, patchPosition } from "./worldMapModel";
import styles from "./worldMapViewer.module.css";

const SPAN = EXPANSIONS.length;
const pct = (position: number) => `${(Math.max(0, Math.min(SPAN, position)) / SPAN) * 100}%`;

/**
 * The timeline under the map: eras as chips and bands, expansions as ticks,
 * world events as runes; the thumb scrubs through time and the map follows.
 */
export function MapTimeline({ lang, eras, events, era, activeEvent, compare, canCompare, onEra, onEvent, onCompare }: {
  lang: Lang; eras: AtlasEra[]; events: AtlasEvent[]; era: AtlasEra | null; activeEvent: AtlasEvent | null;
  compare: boolean; canCompare: boolean;
  onEra(era: AtlasEra): void; onEvent(event: AtlasEvent): void; onCompare(): void;
}) {
  const copy = worldMapCopy[lang];
  const track = useRef<HTMLDivElement>(null);
  const eraStart = era ? patchPosition(era.range[0]) : SPAN - 0.5;
  const [time, setTime] = useState(activeEvent ? patchPosition(activeEvent.patch) : eraStart);
  const [peek, setPeek] = useState<AtlasEvent | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (dragging.current) return;
    setTime(activeEvent ? patchPosition(activeEvent.patch) : era ? Math.max(patchPosition(era.range[0]), Math.min(patchPosition(era.range[1]), time)) : time);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow the era/event, not our own scrubbing
  }, [era?.id, activeEvent?.id]);

  const positionAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect) return time;
    return Math.max(0, Math.min(SPAN - 0.001, ((clientX - rect.left) / rect.width) * SPAN));
  };
  const scrubTo = (position: number) => {
    setTime(position);
    const next = eraAt(eras, position);
    if (next && next.id !== era?.id) onEra(next);
  };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-event-rune]")) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubTo(positionAt(event.clientX));
  };
  const move = (event: PointerEvent<HTMLDivElement>) => { if (dragging.current) scrubTo(positionAt(event.clientX)); };
  const up = () => { dragging.current = false; };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const ordered = eras;
    const index = ordered.findIndex((entry) => entry.id === era?.id);
    const go = (i: number) => { const next = ordered[Math.max(0, Math.min(ordered.length - 1, i))]; if (next) { setTime(patchPosition(next.range[0])); onEra(next); } };
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); go(index - 1); }
    if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); go(index + 1); }
    if (event.key === "Home") { event.preventDefault(); go(0); }
    if (event.key === "End") { event.preventDefault(); go(ordered.length - 1); }
  };
  const nowLabel = era ? `${era.name} · ${EXPANSIONS[Math.min(SPAN - 1, Math.floor(time))]?.name ?? ""}` : "";

  return (
    <div className={styles.timeline} data-map-ui>
      <div className={styles.eraRow}>
        <Hourglass aria-hidden="true" className={styles.eraIcon} />
        <div className={styles.eraChips} role="group" aria-label={copy.eras}>
          {eras.map((entry) => (
            <button key={entry.id} type="button" className={styles.eraChip} aria-pressed={entry.id === era?.id} onClick={() => { setTime(patchPosition(entry.range[0])); onEra(entry); }}>
              {entry.name}
            </button>
          ))}
        </div>
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
            style={{ left: pct(patchPosition(entry.range[0])), width: `calc(${pct(patchPosition(entry.range[1]) + 0.45)} - ${pct(patchPosition(entry.range[0]))})` }} />
        ))}
        <ol className={styles.ticks} aria-hidden="true">
          {EXPANSIONS.map((expansion) => (
            <li key={expansion.id} style={{ left: pct(expansion.major - 1) }} data-wide={expansion.major % 2 === 0 ? undefined : ""}>
              <span>{expansion.short}</span>
            </li>
          ))}
        </ol>
        {events.map((event) => (
          <button key={event.id} type="button" data-event-rune className={styles.rune} data-active={event.id === activeEvent?.id ? "" : undefined}
            style={{ left: pct(patchPosition(event.patch)) }}
            aria-label={`${event.title}, ${copy.patch} ${event.patch}`}
            onPointerEnter={() => setPeek(event)} onPointerLeave={() => setPeek((current) => (current?.id === event.id ? null : current))}
            onFocus={() => setPeek(event)} onBlur={() => setPeek(null)}
            onClick={() => { setTime(patchPosition(event.patch)); onEvent(event); }}>
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
