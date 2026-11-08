"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, Columns2, Hourglass, LocateFixed, X } from "lucide-react";
import { lessMotion } from "@/lib/client/motionPreference";
import type { ArtEraInfo, AtlasEra, AtlasEvent, Lang } from "@/lib/wow/worldMap/bundle";
import { EXPANSIONS, worldMapCopy } from "./worldMapCopy";
import { EVENT_ICON } from "./ui/mapIcons";
import { groupRunes } from "./ui/timelineRunes";
import { buildStops, nearestStop, patchLabel, pickStop, SPAN, stepStop, stopAt, yearsOf, type TimelineStop } from "./ui/timelineStops";
import { eraAt, patchPosition } from "./worldMapModel";
import styles from "./ui/mapChrome.module.css";

const clampPos = (position: number) => Math.max(0, Math.min(SPAN, position));
const pct = (position: number) => `${(clampPos(position) / SPAN) * 100}%`;
const accentStyle = (accent?: string) => (accent ? ({ ["--era-accent" as string]: accent } as CSSProperties) : undefined);
/** A thumb rides a lane as wide as the track: a percentage of the lane's own width is a place on the rail (transform only). */
const lane = (position: number) => ({ transform: `translate3d(${(clampPos(position) / SPAN) * 100}%, 0, 0)` });
/** Pointer travel (px) that turns a press into a scrub. */
const DRAG_PX = 4;
/** A click this close (px) to a patch mark, low on the band where the marks are, picks the mark rather than the era. */
const REACH_PX = 10;
/** The marks' row: the lower part of the track (px from its top). */
const MARKS_FROM = 31;

type Side = "right" | "left";
type Drag = { side: Side; at: number; x: number; moved: boolean; id: number };

/**
 * The timeline under the map, drawn as the game's own control: one plaque band
 * per expansion in its colour with its name, marks inside a band where the map
 * changes within it (a patch with world events, a phase of the art), the
 * events as runes on the band's edge. The thumb is dragged (it snaps to the
 * nearest mark and the map follows), a band is clicked, the arrows step mark
 * by mark, Page Up/Down era by era, Home/End to the ends. Hovering a band
 * names the moment before it is chosen. Comparing, a second thumb holds the
 * moment on the left of the divider. On phones the bands scroll sideways.
 */
export function MapTimeline({ lang, eras, events, phases, position, activeEvent, compare, compareLeft, canCompare, onPosition, onCompareLeft, onEvent, onCompare }: {
  lang: Lang; eras: AtlasEra[]; events: AtlasEvent[]; phases?: ArtEraInfo[]; position: number; activeEvent: AtlasEvent | null;
  compare: boolean; compareLeft: number | null; canCompare: boolean;
  onPosition(position: number): void; onCompareLeft(position: number): void; onEvent(event: AtlasEvent): void; onCompare(): void;
}) {
  const copy = worldMapCopy[lang];
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [peek, setPeek] = useState<AtlasEvent[] | null>(null);
  const hidePeek = useRef(0);
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const tap = useRef<{ x: number; y: number; id: number } | null>(null);
  const [hover, setHover] = useState<{ at: number; reach: number } | null>(null);
  // A thumb in keyboard focus names its moment too.
  const [focused, setFocused] = useState<Side | null>(null);
  const emitted = useRef<{ right: number | null; left: number | null }>({ right: null, left: null });
  const frame = useRef(0);
  const pendingMove = useRef<{ x: number; y: number; kind: "drag" | "hover" } | null>(null);

  const stops = useMemo(() => buildStops(eras, events, phases), [eras, events, phases]);
  const era = eraAt(eras, position);
  const leftEra = compareLeft === null ? null : eraAt(eras, compareLeft);
  const here = stopAt(stops, position);
  const accents = useMemo(() => new Map(eras.map((entry) => [entry.id, entry.accent])), [eras]);
  const ordered = useMemo(() => [...events].sort((a, b) => patchPosition(a.patch) - patchPosition(b.patch)), [events]);
  // The rail's width: events closer than one rune on screen share it.
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
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); window.clearTimeout(hidePeek.current); }, []);

  // The stage learns how tall the timeline is: the overview inset sits right above it.
  useLayoutEffect(() => {
    const el = root.current;
    const stage = el?.closest<HTMLElement>("[data-map-stage]");
    if (!el || !stage) return;
    const write = () => stage.style.setProperty("--map-timeline-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    const observer = new ResizeObserver(write);
    observer.observe(el);
    write();
    return () => { observer.disconnect(); stage.style.removeProperty("--map-timeline-h"); };
  }, []);

  // Phones: the band of the moment stays in sight in the sideways strip.
  const eraMajor = Math.floor(clampPos(position) - 1e-6);
  useEffect(() => {
    const box = scroller.current, band = track.current?.querySelector<HTMLElement>(`[data-band="${eraMajor}"]`);
    if (!box || !band || box.scrollWidth <= box.clientWidth + 1) return;
    const left = band.offsetLeft - (box.clientWidth - band.offsetWidth) / 2;
    box.scrollTo({ left, behavior: lessMotion() ? "auto" : "smooth" });
  }, [eraMajor, open]);

  const positionAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || !rect.width) return position;
    return Math.max(0, Math.min(SPAN - 0.001, ((clientX - rect.left) / rect.width) * SPAN));
  };
  // Aiming at the band picks its era; aiming at the marks' row picks the nearest mark.
  const reach = (clientY: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || clientY - rect.top < MARKS_FROM) return 0;
    return (REACH_PX / Math.max(1, rect.width)) * SPAN;
  };
  const emit = (stop: TimelineStop | null, side: Side) => {
    if (!stop || emitted.current[side] === stop.at) return;
    emitted.current[side] = stop.at;
    if (side === "left") onCompareLeft(stop.at);
    else onPosition(stop.at);
  };
  // Pointer moves are read once per frame, however fast the pointer.
  const schedule = (x: number, y: number, kind: "drag" | "hover") => {
    pendingMove.current = { x, y, kind };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const move = pendingMove.current;
      pendingMove.current = null;
      if (!move) return;
      const at = positionAt(move.x);
      if (move.kind === "hover") { const next = { at, reach: reach(move.y) }; setHover((was) => (was && was.at === next.at && was.reach === next.reach ? was : next)); return; }
      const current = dragRef.current;
      if (!current) return;
      const moved = current.moved || Math.abs(move.x - current.x) > DRAG_PX;
      const next = { ...current, at, moved };
      dragRef.current = next;
      setDrag(next);
      // Scrubbing snaps to the nearest mark: the map changes only where the game's map did.
      if (moved) emit(nearestStop(stops, at), current.side);
    });
  };

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-event-rune]")) return;
    const onThumb = (event.target as HTMLElement).closest<HTMLElement>("[data-thumb]");
    // A finger on the strip scrolls it; a tap picks (scrubbing starts from the thumb).
    if (event.pointerType === "touch" && !onThumb) { tap.current = { x: event.clientX, y: event.clientY, id: event.pointerId }; return; }
    const at = positionAt(event.clientX);
    const side: Side = onThumb ? (onThumb.dataset.thumb as Side)
      : compareLeft !== null && Math.abs(at - compareLeft) < Math.abs(at - position) ? "left" : "right";
    emitted.current[side] = side === "left" ? compareLeft : position;
    const next: Drag = { side, at: onThumb ? (side === "left" ? compareLeft ?? at : position) : at, x: event.clientX, moved: false, id: event.pointerId };
    dragRef.current = next;
    setDrag(next);
    setHover(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    // A press on a band picks its era (or the mark right under the pointer) at once.
    if (!onThumb) emit(pickStop(stops, at, reach(event.clientY)), side);
  };
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id === event.pointerId) { schedule(event.clientX, event.clientY, "drag"); return; }
    if (event.pointerType === "mouse" && !(event.target as HTMLElement).closest("[data-event-rune], [data-peek]")) schedule(event.clientX, event.clientY, "hover");
    else if (hover !== null) setHover(null);
  };
  const onUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = tap.current;
    tap.current = null;
    if (start && start.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) {
      emitted.current.right = position;
      emit(pickStop(stops, positionAt(event.clientX), reach(event.clientY) * 1.6), "right");
    }
    if (dragRef.current?.id === event.pointerId) { dragRef.current = null; setDrag(null); }
  };
  const onCancel = () => { tap.current = null; dragRef.current = null; setDrag(null); };

  const go = (stop: TimelineStop | null, side: Side) => {
    if (!stop) return;
    emitted.current[side] = null;
    emit(stop, side);
  };
  const key = (event: KeyboardEvent<HTMLDivElement>, side: Side) => {
    const at = side === "left" ? compareLeft ?? position : position;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => go(stepStop(stops, at, -1), side), ArrowDown: () => go(stepStop(stops, at, -1), side),
      ArrowRight: () => go(stepStop(stops, at, 1), side), ArrowUp: () => go(stepStop(stops, at, 1), side),
      PageDown: () => go(stepStop(stops, at, -1, true), side), PageUp: () => go(stepStop(stops, at, 1, true), side),
      Home: () => go(stops[0] ?? null, side), End: () => go(stops.at(-1) ?? null, side),
    };
    const run = keys[event.key];
    if (run) { event.preventDefault(); run(); }
  };
  const showPeek = (group: AtlasEvent[] | null) => { window.clearTimeout(hidePeek.current); setPeek(group); };
  // The tooltip stays while the pointer travels from the rune to it.
  const leavePeek = () => { window.clearTimeout(hidePeek.current); hidePeek.current = window.setTimeout(() => setPeek(null), 220); };

  // What a stop is, in a few words: the era and its years, or the patch and what changed with it.
  const stopMeta = (stop: TimelineStop | null) => {
    if (!stop) return "";
    if (stop.main) return yearsOf(stop.era);
    const what = stop.phase ?? stop.events[0]?.title;
    return [`${copy.patch} ${patchLabel(stop.patch ?? "")}`, what].filter(Boolean).join(" · ");
  };
  const valueText = (stop: TimelineStop | null, at: AtlasEra | null) => [at?.name, stop?.main === false ? stopMeta(stop) : yearsOf(at)].filter(Boolean).join(", ");
  const meta = stopMeta(here);
  const hoverStop = hover === null || drag ? null : pickStop(stops, hover.at, hover.reach);
  const dragStop = drag?.moved ? nearestStop(stops, drag.at) : null;
  const focusStop = focused === "left" ? (compareLeft === null ? null : stopAt(stops, compareLeft)) : focused === "right" ? here : null;
  const hintStop = dragStop ?? hoverStop ?? focusStop;
  const hintAt = dragStop ? drag!.at : hintStop ? (hintStop === focusStop && !hoverStop ? (focused === "left" ? compareLeft ?? 0 : position) : hintStop.at) : 0;
  const peekAt = peek ? patchPosition(peek[0].patch) : 0;
  const samePatch = Boolean(peek && peek.length > 1 && peek.every((event) => event.patch === peek[0].patch));
  const shownRight = drag?.side === "right" && drag.moved ? drag.at : position;
  const shownLeft = drag?.side === "left" && drag.moved ? drag.at : compareLeft;
  const between = shownLeft === null ? null : [Math.min(shownLeft, shownRight), Math.max(shownLeft, shownRight)];
  const stepIndex = here ? stops.indexOf(here) : -1;
  const abbr = (expansion: (typeof EXPANSIONS)[number]) => (expansion.id === "classic" ? copy.expansion.classic : expansion.short);

  return (
    <div ref={root} className={styles.timeline} data-map-ui data-open={open ? "" : undefined} data-dragging={drag?.moved ? "" : undefined}
      data-compare={compare ? "" : undefined} style={accentStyle(era?.accent)}>
      <div className={styles.head}>
        <span className={styles.swatch} aria-hidden="true" />
        <p className={styles.now} aria-live="polite">
          {/* A new era slides in (the key restarts the animation). */}
          <span key={era?.id} className={styles.name}>{era?.name}</span>
          {meta ? <span key={`${era?.id}-${here?.at}`} className={styles.meta}>{meta}</span> : null}
        </p>
        <span className={styles.step}>
          <button type="button" aria-label={copy.earlier} title={copy.earlier} disabled={stepIndex <= 0 && position <= (stops[0]?.at ?? 0) + 1e-6} onClick={() => go(stepStop(stops, position, -1), "right")}><ChevronLeft aria-hidden="true" /></button>
          <button type="button" aria-label={copy.later} title={copy.later} disabled={stepIndex >= stops.length - 1} onClick={() => go(stepStop(stops, position, 1), "right")}><ChevronRight aria-hidden="true" /></button>
        </span>
        {canCompare || compare ? (
          <button type="button" className={styles.compareButton} aria-pressed={compare} onClick={onCompare} title={compare ? copy.compareOff : copy.compare}>
            {compare ? <X aria-hidden="true" /> : <Columns2 aria-hidden="true" />}
            <span>{copy.compare}</span>
          </button>
        ) : null}
        <button type="button" className={styles.toggle} aria-expanded={open} aria-controls="world-map-track"
          aria-label={copy.timeline} title={copy.timeline} onClick={() => setOpen((o) => !o)}>
          <ChevronUp aria-hidden="true" />
        </button>
      </div>
      <div id="world-map-track" ref={scroller} className={styles.scroller}>
        <div className={styles.track} ref={track} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}
          onPointerLeave={() => setHover(null)}>
          <ol className={styles.bands} aria-hidden="true">
            {EXPANSIONS.map((expansion, index) => {
              const owner = eraAt(eras, index + 0.05);
              const active = index === eraMajor;
              return (
                <li key={expansion.id} data-band={index} className={styles.band} style={accentStyle(owner?.accent)}
                  data-active={active ? "" : undefined} data-past={index < eraMajor ? "" : undefined}
                  data-left={shownLeft !== null && index === Math.floor(clampPos(shownLeft) - 1e-6) ? "" : undefined}
                  data-hover={hoverStop && Math.floor(hoverStop.at + 1e-6) === index ? "" : undefined}>
                  <span className={styles.bandLabel}>{copy.expansion[expansion.id]}</span>
                  <span className={styles.bandAbbr}>{abbr(expansion)}</span>
                </li>
              );
            })}
          </ol>
          {between ? <span className={styles.span} aria-hidden="true" style={{ left: pct(between[0]), width: `calc(${pct(between[1])} - ${pct(between[0])})` }} /> : null}
          {stops.filter((stop) => !stop.main).map((stop) => (
            <span key={stop.at} aria-hidden="true" className={styles.notch} style={{ left: pct(stop.at), ...accentStyle(stop.era.accent) }}
              data-on={stop.at <= position + 1e-6 && Math.floor(stop.at + 1e-6) === eraMajor ? "" : undefined} data-here={stop === here ? "" : undefined} />
          ))}
          {runes.map((group) => {
            const first = group[0];
            const at = group.findIndex((event) => event.id === activeEvent?.id);
            // A shared rune opens its events one after another.
            const openNext = () => onEvent(group[(at + 1) % group.length]);
            return (
              <button key={first.id} type="button" tabIndex={-1} data-event-rune className={styles.rune} data-active={at >= 0 ? "" : undefined} data-many={group.length > 1 ? "" : undefined}
                style={{ left: pct(patchPosition(first.patch)), ...accentStyle(accents.get(first.era)) }}
                aria-label={group.map((event) => `${event.title}, ${copy.patch} ${event.patch}`).join("; ")}
                onPointerEnter={() => { setHover(null); showPeek(group); }} onPointerLeave={leavePeek}
                onClick={openNext}>
                <span aria-hidden="true" />
              </button>
            );
          })}
          {shownLeft !== null ? (
            <div className={styles.thumbLane} data-side="left" data-moving={drag?.side === "left" && drag.moved ? "" : undefined} style={lane(shownLeft)}>
              <div className={styles.thumb} data-thumb="left" role="slider" tabIndex={0} aria-label={copy.compareWith}
                aria-valuemin={0} aria-valuemax={SPAN} aria-valuenow={Math.round((compareLeft ?? 0) * 100) / 100}
                aria-valuetext={valueText(compareLeft === null ? null : stopAt(stops, compareLeft), leftEra)}
                style={accentStyle(leftEra?.accent)} onKeyDown={(event) => key(event, "left")}
                onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) setFocused("left"); }} onBlur={() => setFocused(null)} />
            </div>
          ) : null}
          <div className={styles.thumbLane} data-moving={drag?.side === "right" && drag.moved ? "" : undefined} style={lane(shownRight)}>
            <div className={styles.thumb} data-thumb="right" role="slider" tabIndex={0} aria-label={copy.timeline} aria-keyshortcuts="PageUp PageDown Home End"
              aria-valuemin={0} aria-valuemax={SPAN} aria-valuenow={Math.round(position * 100) / 100}
              aria-valuetext={valueText(here, era)} onKeyDown={(event) => key(event, "right")}
              onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) setFocused("right"); }} onBlur={() => setFocused(null)} />
          </div>
          {hintStop && !peek ? (
            // The moment under the pointer (or the thumb being dragged), before it is chosen.
            <div className={styles.hint} role="presentation" style={{ left: `clamp(110px, ${pct(hintAt)}, calc(100% - 110px))`, ...accentStyle(hintStop.era.accent) }}>
              <strong>{hintStop.main ? hintStop.era.name : `${copy.patch} ${patchLabel(hintStop.patch ?? "")}`}</strong>
              <span className={styles.hintMeta}>{hintStop.main ? yearsOf(hintStop.era) : hintStop.era.name}</span>
              {(hintStop.phase ? [hintStop.phase] : []).concat(hintStop.events.slice(0, hintStop.phase ? 1 : 2).map((event) => event.title)).map((line) => (
                <span key={line} className={styles.hintLine}>{line}</span>
              ))}
            </div>
          ) : null}
          {peek ? (
            <div className={styles.peek} role="tooltip" data-peek onPointerEnter={() => showPeek(peek)} onPointerLeave={leavePeek}
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
    </div>
  );
}
