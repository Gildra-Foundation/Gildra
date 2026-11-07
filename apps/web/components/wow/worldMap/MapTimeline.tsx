"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, Columns2 } from "lucide-react";
import type { AtlasEra, AtlasEvent, Lang } from "@/lib/wow/worldMap/bundle";
import { EXPANSIONS, worldMapCopy } from "./worldMapCopy";
import { groupRunes } from "./ui/timelineRunes";
import { eraAt, patchPosition, restOf } from "./worldMapModel";
import styles from "./worldMapViewer.module.css";

const SPAN = EXPANSIONS.length;
const pct = (position: number) => `${(Math.max(0, Math.min(SPAN, position)) / SPAN) * 100}%`;
const yearsOf = (era: AtlasEra | null) => (era?.years ? (era.years[0] === era.years[1] ? String(era.years[0]) : `${era.years[0]}–${era.years[1]}`) : "");

/**
 * The timeline under the map: one band per expansion in its colour, world
 * events as small runes above the rail, the thumb scrubs through time and the
 * map follows. Keyboard: arrows step an era, Page Up/Down jump between events,
 * Home/End go to the first and last era. On phones it folds to one row.
 */
export function MapTimeline({ lang, eras, events, position, activeEvent, compare, canCompare, onPosition, onEvent, onCompare }: {
  lang: Lang; eras: AtlasEra[]; events: AtlasEvent[]; position: number; activeEvent: AtlasEvent | null;
  compare: boolean; canCompare: boolean;
  onPosition(position: number): void; onEvent(event: AtlasEvent): void; onCompare(): void;
}) {
  const copy = worldMapCopy[lang];
  const track = useRef<HTMLDivElement>(null);
  const [peek, setPeek] = useState<AtlasEvent[] | null>(null);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pending = useRef<number | null>(null);
  const frame = useRef(0);
  const era = eraAt(eras, position);
  const accents = useMemo(() => new Map(eras.map((entry) => [entry.id, entry.accent])), [eras]);
  const ordered = useMemo(() => [...events].sort((a, b) => patchPosition(a.patch) - patchPosition(b.patch)), [events]);
  // The rail's width: events closer than one rune on screen share it (one patch, or neighbouring patches on a phone).
  const [railWidth, setRailWidth] = useState(0);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setRailWidth(el.clientWidth));
    observer.observe(el);
    setRailWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  const runes = useMemo(() => groupRunes(ordered, railWidth), [ordered, railWidth]);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  // Scrubbing moves the map once per frame, however fast the pointer.
  const scrub = (next: number) => {
    pending.current = next;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (pending.current !== null) onPosition(pending.current);
    });
  };
  const positionAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect) return position;
    return Math.max(0, Math.min(SPAN - 0.001, ((clientX - rect.left) / rect.width) * SPAN));
  };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-event-rune]")) return;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    scrub(positionAt(event.clientX));
  };
  const move = (event: PointerEvent<HTMLDivElement>) => { if (dragging) scrub(positionAt(event.clientX)); };
  const up = () => setDragging(false);

  const eraIndex = eras.findIndex((entry) => entry.id === era?.id);
  const goEra = (i: number) => { const next = eras[Math.max(0, Math.min(eras.length - 1, i))]; if (next) onPosition(restOf(eras, next)); };
  const step = (delta: number) => goEra(eraIndex + delta);
  const jumpEvent = (delta: number) => {
    const from = activeEvent ? patchPosition(activeEvent.patch) : position;
    const list = delta > 0 ? ordered.filter((e) => patchPosition(e.patch) > from + 1e-6) : ordered.filter((e) => patchPosition(e.patch) < from - 1e-6).reverse();
    const next = activeEvent ? list.find((e) => e.id !== activeEvent.id) : list[0];
    if (next) { onEvent(next); setPeek([next]); }
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => step(-1), ArrowDown: () => step(-1), ArrowRight: () => step(1), ArrowUp: () => step(1),
      PageDown: () => jumpEvent(-1), PageUp: () => jumpEvent(1), Home: () => goEra(0), End: () => goEra(eras.length - 1),
    };
    const run = keys[event.key];
    if (run) { event.preventDefault(); run(); }
  };
  const years = yearsOf(era);
  const accent = era?.accent ? ({ ["--era-accent" as string]: era.accent } as CSSProperties) : undefined;

  return (
    <div className={styles.timeline} data-map-ui data-open={open ? "" : undefined} data-dragging={dragging ? "" : undefined} style={accent}>
      <div className={styles.eraRow}>
        <span className={styles.eraSwatch} aria-hidden="true" />
        <p className={styles.eraNow} aria-live="polite">
          <span className={styles.eraName}>{era?.name}</span>
          {years ? <span className={styles.eraYears}>{years}</span> : null}
        </p>
        <span className={styles.eraStep}>
          <button type="button" aria-label={copy.earlier} title={copy.earlier} disabled={eraIndex <= 0} onClick={() => step(-1)}><ChevronLeft aria-hidden="true" /></button>
          <button type="button" aria-label={copy.later} title={copy.later} disabled={eraIndex >= eras.length - 1} onClick={() => step(1)}><ChevronRight aria-hidden="true" /></button>
        </span>
        {/* Always in place (the rail does not jump); off where no other era draws this place differently. */}
        <button type="button" className={styles.compareButton} aria-pressed={compare} disabled={!canCompare && !compare} onClick={onCompare} title={copy.compare}>
          <Columns2 aria-hidden="true" />
          <span>{copy.compare}</span>
        </button>
        <button type="button" className={styles.timelineToggle} data-timeline-toggle aria-expanded={open} aria-controls="world-map-track"
          aria-label={copy.timeline} title={copy.timeline} onClick={() => setOpen((o) => !o)}>
          <ChevronUp aria-hidden="true" />
        </button>
      </div>
      <div id="world-map-track" className={styles.track} ref={track} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className={styles.rail} aria-hidden="true" />
        {eras.map((entry) => (
          <span key={entry.id} aria-hidden="true" className={styles.band} data-active={entry.id === era?.id ? "" : undefined}
            style={{ left: pct(patchPosition(entry.range[0])), width: `calc(${pct(Math.min(SPAN, patchPosition(entry.range[1]) + 0.45))} - ${pct(patchPosition(entry.range[0]))})`, ...(entry.accent ? { ["--era-accent" as string]: entry.accent } : {}) }} />
        ))}
        <ol className={styles.ticks} aria-hidden="true">
          {EXPANSIONS.map((expansion) => {
            const target = eraAt(eras, expansion.major - 1 + 0.05);
            return (
              <li key={expansion.id} style={{ left: pct(expansion.major - 1 + 0.5) }} data-wide={expansion.major % 2 === 0 ? undefined : ""}>
                <button type="button" tabIndex={-1} data-event-rune data-active={target?.id === era?.id ? "" : undefined}
                  onClick={() => { if (target) onPosition(restOf(eras, target)); }}>{expansion.short}</button>
              </li>
            );
          })}
        </ol>
        {runes.map((group) => {
          const first = group[0];
          const at = group.findIndex((event) => event.id === activeEvent?.id);
          // A shared rune opens its events one after another.
          const open = () => onEvent(group[(at + 1) % group.length]);
          return (
            <button key={first.id} type="button" tabIndex={-1} data-event-rune className={styles.rune} data-active={at >= 0 ? "" : undefined} data-many={group.length > 1 ? "" : undefined}
              style={{ left: pct(patchPosition(first.patch)), ...(accents.get(first.era) ? { ["--era-accent" as string]: accents.get(first.era) } : {}) }}
              aria-label={group.map((event) => `${event.title}, ${copy.patch} ${event.patch}`).join("; ")}
              onPointerEnter={() => setPeek(group)} onPointerLeave={() => setPeek((current) => (current?.[0].id === first.id ? null : current))}
              onClick={open}>
              <span aria-hidden="true" />
            </button>
          );
        })}
        <div className={styles.thumb} role="slider" tabIndex={0} aria-label={copy.timeline} aria-keyshortcuts="PageUp PageDown Home End"
          aria-valuemin={0} aria-valuemax={SPAN} aria-valuenow={Math.round(position * 10) / 10}
          aria-valuetext={[era?.name, years].filter(Boolean).join(", ")}
          style={{ left: pct(position) }} onKeyDown={key} onBlur={() => setPeek(null)} />
        {peek ? (
          <div className={styles.peek} role="tooltip" style={{ left: `clamp(130px, ${pct(patchPosition(peek[0].patch))}, calc(100% - 130px))` }}>
            <span className={styles.peekMeta}>{copy.patch} {peek[0].patch}{peek[0].year ? ` · ${peek[0].year}` : ""}</span>
            {peek.slice(0, 5).map((event) => <strong key={event.id}>{event.title}</strong>)}
            {peek.length > 5 ? <span>{copy.and(peek.length - 5).trim()}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
