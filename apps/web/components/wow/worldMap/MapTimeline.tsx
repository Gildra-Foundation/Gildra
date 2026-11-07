"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, Columns2, Hourglass, LocateFixed } from "lucide-react";
import type { AtlasEra, AtlasEvent, Lang } from "@/lib/wow/worldMap/bundle";
import { EXPANSIONS, worldMapCopy } from "./worldMapCopy";
import { EVENT_ICON } from "./ui/mapIcons";
import { groupRunes } from "./ui/timelineRunes";
import { eraAt, patchPosition, restOf } from "./worldMapModel";
import styles from "./worldMapViewer.module.css";

const SPAN = EXPANSIONS.length;
const clampPos = (position: number) => Math.max(0, Math.min(SPAN, position));
const pct = (position: number) => `${(clampPos(position) / SPAN) * 100}%`;
const yearsOf = (era: AtlasEra | null) => (era?.years ? (era.years[0] === era.years[1] ? String(era.years[0]) : `${era.years[0]}–${era.years[1]}`) : "");
const accentStyle = (accent?: string) => (accent ? ({ ["--era-accent" as string]: accent } as CSSProperties) : undefined);
/** A thumb rides a lane as wide as the track: a percentage of the lane's own width is a place on the rail (transform only). */
const lane = (position: number) => ({ transform: `translate3d(${(clampPos(position) / SPAN) * 100}%, 0, 0)` });

/**
 * The timeline under the map: one band per expansion in its colour, world
 * events as runes above the rail, the thumb scrubs through time and the map
 * follows. Comparing, a second thumb holds the moment on the left of the
 * divider. Keyboard: arrows step an era, Page Up/Down jump between events,
 * Home/End go to the first and last era. On phones it folds to one row.
 */
export function MapTimeline({ lang, eras, events, position, activeEvent, compare, compareLeft, canCompare, onPosition, onCompareLeft, onEvent, onCompare }: {
  lang: Lang; eras: AtlasEra[]; events: AtlasEvent[]; position: number; activeEvent: AtlasEvent | null;
  compare: boolean; compareLeft: number | null; canCompare: boolean;
  onPosition(position: number): void; onCompareLeft(position: number): void; onEvent(event: AtlasEvent): void; onCompare(): void;
}) {
  const copy = worldMapCopy[lang];
  const track = useRef<HTMLDivElement>(null);
  const [peek, setPeek] = useState<AtlasEvent[] | null>(null);
  const hide = useRef(0);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState<"right" | "left" | null>(null);
  const pending = useRef<number | null>(null);
  const frame = useRef(0);
  const era = eraAt(eras, position);
  const leftEra = compareLeft === null ? null : eraAt(eras, compareLeft);
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
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); window.clearTimeout(hide.current); }, []);

  // Scrubbing moves the map once per frame, however fast the pointer.
  const scrub = (next: number, side: "right" | "left") => {
    pending.current = next;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (pending.current === null) return;
      if (side === "left") onCompareLeft(pending.current);
      else onPosition(pending.current);
    });
  };
  const positionAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect) return position;
    return Math.max(0, Math.min(SPAN - 0.001, ((clientX - rect.left) / rect.width) * SPAN));
  };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-event-rune]")) return;
    const at = positionAt(event.clientX);
    // Comparing: the nearer thumb follows the pointer.
    const side = compareLeft !== null && Math.abs(at - compareLeft) < Math.abs(at - position) ? "left" : "right";
    setDragging(side);
    event.currentTarget.setPointerCapture(event.pointerId);
    scrub(at, side);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => { if (dragging) scrub(positionAt(event.clientX), dragging); };
  const up = () => setDragging(null);

  const indexOf = (target: AtlasEra | null) => eras.findIndex((entry) => entry.id === target?.id);
  const eraIndex = indexOf(era);
  const goEra = (i: number, side: "right" | "left" = "right") => {
    const next = eras[Math.max(0, Math.min(eras.length - 1, i))];
    if (!next) return;
    if (side === "left") onCompareLeft(restOf(eras, next));
    else onPosition(restOf(eras, next));
  };
  const step = (delta: number) => goEra(eraIndex + delta);
  const showPeek = (group: AtlasEvent[] | null) => { window.clearTimeout(hide.current); setPeek(group); };
  // The tooltip stays while the pointer travels from the rune to it.
  const leavePeek = () => { window.clearTimeout(hide.current); hide.current = window.setTimeout(() => setPeek(null), 220); };
  const jumpEvent = (delta: number) => {
    const from = activeEvent ? patchPosition(activeEvent.patch) : position;
    const list = delta > 0 ? ordered.filter((e) => patchPosition(e.patch) > from + 1e-6) : ordered.filter((e) => patchPosition(e.patch) < from - 1e-6).reverse();
    const next = activeEvent ? list.find((e) => e.id !== activeEvent.id) : list[0];
    if (next) { onEvent(next); showPeek([next]); }
  };
  const key = (event: KeyboardEvent<HTMLDivElement>, side: "right" | "left") => {
    const at = side === "left" ? indexOf(leftEra) : eraIndex;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => goEra(at - 1, side), ArrowDown: () => goEra(at - 1, side), ArrowRight: () => goEra(at + 1, side), ArrowUp: () => goEra(at + 1, side),
      Home: () => goEra(0, side), End: () => goEra(eras.length - 1, side),
      ...(side === "right" ? { PageDown: () => jumpEvent(-1), PageUp: () => jumpEvent(1) } : {}),
    };
    const run = keys[event.key];
    if (run) { event.preventDefault(); run(); }
  };
  const years = yearsOf(era);
  const peekAt = peek ? patchPosition(peek[0].patch) : 0;
  const samePatch = Boolean(peek && peek.length > 1 && peek.every((event) => event.patch === peek[0].patch));
  const between = compareLeft === null ? null : [Math.min(compareLeft, position), Math.max(compareLeft, position)];

  return (
    <div className={styles.timeline} data-map-ui data-open={open ? "" : undefined} data-dragging={dragging ? "" : undefined} data-compare={compare ? "" : undefined} style={accentStyle(era?.accent)}>
      <div className={styles.eraRow}>
        <span className={styles.eraSwatch} aria-hidden="true" />
        <p className={styles.eraNow} aria-live="polite">
          {/* A new era slides in (the key restarts the animation). */}
          <span key={era?.id} className={styles.eraName}>{era?.name}</span>
          {years ? <span key={`${era?.id}-years`} className={styles.eraYears}>{years}</span> : null}
        </p>
        <span className={styles.eraStep}>
          <button type="button" aria-label={copy.earlier} title={copy.earlier} disabled={eraIndex <= 0} onClick={() => step(-1)}><ChevronLeft aria-hidden="true" /></button>
          <button type="button" aria-label={copy.later} title={copy.later} disabled={eraIndex >= eras.length - 1} onClick={() => step(1)}><ChevronRight aria-hidden="true" /></button>
        </span>
        {/* Always in place (the rail does not jump); off where no other era draws this place differently. */}
        <button type="button" className={styles.compareButton} aria-pressed={compare} disabled={!canCompare && !compare} onClick={onCompare} title={compare ? copy.compareOff : copy.compare}>
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
          <span key={entry.id} aria-hidden="true" className={styles.band} data-active={entry.id === era?.id || entry.id === leftEra?.id ? "" : undefined}
            style={{ left: pct(patchPosition(entry.range[0])), width: `calc(${pct(Math.min(SPAN, patchPosition(entry.range[1]) + 0.45))} - ${pct(patchPosition(entry.range[0]))})`, ...accentStyle(entry.accent) }} />
        ))}
        {between ? <span className={styles.span} aria-hidden="true" style={{ left: pct(between[0]), width: `calc(${pct(between[1])} - ${pct(between[0])})` }} /> : null}
        <ol className={styles.ticks} aria-hidden="true">
          {EXPANSIONS.map((expansion) => {
            const target = eraAt(eras, expansion.major - 1 + 0.05);
            return (
              <li key={expansion.id} style={{ left: pct(expansion.major - 1 + 0.5), ...accentStyle(target?.accent) }} data-wide={expansion.major % 2 === 0 ? undefined : ""}>
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
          const openNext = () => onEvent(group[(at + 1) % group.length]);
          return (
            <button key={first.id} type="button" tabIndex={-1} data-event-rune className={styles.rune} data-active={at >= 0 ? "" : undefined} data-many={group.length > 1 ? "" : undefined}
              style={{ left: pct(patchPosition(first.patch)), ...accentStyle(accents.get(first.era)) }}
              aria-label={group.map((event) => `${event.title}, ${copy.patch} ${event.patch}`).join("; ")}
              onPointerEnter={() => showPeek(group)} onPointerLeave={leavePeek}
              onClick={openNext}>
              <span aria-hidden="true" />
            </button>
          );
        })}
        {compareLeft !== null ? (
          <div className={styles.thumbLane} data-side="left" style={lane(compareLeft)}>
            <div className={styles.thumb} data-side="left" role="slider" tabIndex={0} aria-label={copy.compareWith}
              aria-valuemin={0} aria-valuemax={SPAN} aria-valuenow={Math.round(compareLeft * 10) / 10}
              aria-valuetext={[leftEra?.name, yearsOf(leftEra)].filter(Boolean).join(", ")}
              style={accentStyle(leftEra?.accent)} onKeyDown={(event) => key(event, "left")} />
          </div>
        ) : null}
        <div className={styles.thumbLane} style={lane(position)}>
          <div className={styles.thumb} role="slider" tabIndex={0} aria-label={copy.timeline} aria-keyshortcuts="PageUp PageDown Home End"
            aria-valuemin={0} aria-valuemax={SPAN} aria-valuenow={Math.round(position * 10) / 10}
            aria-valuetext={[era?.name, years].filter(Boolean).join(", ")}
            onKeyDown={(event) => key(event, "right")} onBlur={leavePeek} />
        </div>
        {peek ? (
          <div className={styles.peek} role="tooltip" onPointerEnter={() => showPeek(peek)} onPointerLeave={leavePeek}
            style={{ left: `clamp(150px, ${pct(peekAt)}, calc(100% - 150px))`, ...accentStyle(accents.get(peek[0].era)) }}>
            {/* Events of one patch name it once, above them. */}
            {samePatch ? <span className={styles.peekHead}>{copy.patch} {peek[0].patch}{peek[0].year ? ` · ${peek[0].year}` : ""}</span> : null}
            {peek.slice(0, 4).map((event) => {
              const Rune = EVENT_ICON[event.kind ?? ""] ?? Hourglass;
              return (
                <div key={event.id} className={styles.peekEvent}>
                  <span className={styles.peekRune} aria-hidden="true"><Rune /></span>
                  <span className={styles.peekText}>
                    <strong>{event.title}</strong>
                    {samePatch ? null : <span className={styles.peekMeta}>{copy.patch} {event.patch}{event.year ? ` · ${event.year}` : ""}</span>}
                  </span>
                  {event.map !== null ? (
                    <button type="button" data-event-rune className={styles.peekJump} onClick={() => { onEvent(event); setPeek(null); }}
                      aria-label={`${copy.showOnMap}: ${event.title}`} title={copy.showOnMap}><LocateFixed aria-hidden="true" /></button>
                  ) : null}
                </div>
              );
            })}
            {peek.length > 4 ? <span className={styles.peekMore}>{copy.and(peek.length - 4).trim()}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
