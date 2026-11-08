import type { ArtEraInfo, AtlasEra, AtlasEvent } from "@/lib/wow/worldMap/bundle";
import { EXPANSIONS } from "../worldMapCopy";
import { eraAt, orderedEras, patchPosition, restOf } from "../worldMapModel";

export const SPAN = EXPANSIONS.length;

/**
 * A place the thumb rests on: an era (where its own art is in place), or a
 * patch inside it where the map changes — a phase of the art (Theramore in
 * ruins) or the patch of world events.
 */
export type TimelineStop = {
  at: number;
  era: AtlasEra;
  /** The era's own stop (its rest), not a patch inside it. */
  main: boolean;
  patch?: string;
  phase?: string;
  events: AtlasEvent[];
};

const EPS = 1e-6;

/** Stops in time order: each era's rest, then the start of each art phase and each patch with events, once per moment. */
export function buildStops(eras: AtlasEra[], events: AtlasEvent[], phases: ArtEraInfo[] = []): TimelineStop[] {
  const ordered = orderedEras(eras);
  if (!ordered.length) return [];
  const stops: TimelineStop[] = ordered.map((era) => ({ at: restOf(eras, era), era, main: true, events: [] }));
  // The game today rests at the latest era's end: its launch is a mark of its own, where its first changes are.
  const latest = ordered.at(-1) as AtlasEra;
  const launch = Math.min(patchPosition(latest.range[0]) + 0.05, (stops.at(-1) as TimelineStop).at - 0.01);
  stops.push({ at: launch, era: latest, main: false, patch: latest.range[0], events: [] });
  const startOf = (era: AtlasEra) => stops.find((stop) => stop.era.id === era.id && (era.id === latest.id ? !stop.main && stop.at === launch : stop.main)) as TimelineStop;
  const add = (at: number, patch: string, fill: (stop: TimelineStop) => void) => {
    const era = eraAt(eras, at);
    if (!era) return;
    const start = startOf(era);
    // At the era's start the map is the era's own: the patch belongs to the era's first stop.
    if (at <= start.at + EPS) { fill(start); return; }
    let stop = stops.find((entry) => !entry.main && Math.abs(entry.at - at) < 0.0005);
    if (!stop) { stop = { at, era, main: false, patch, events: [] }; stops.push(stop); }
    fill(stop);
  };
  for (const phase of phases) {
    if (!phase.inherits) continue;
    add(patchPosition(phase.range[0]), phase.range[0], (stop) => { stop.phase ??= phase.name; });
  }
  for (const event of events) add(patchPosition(event.patch), event.patch, (stop) => { stop.events.push(event); });
  return stops.sort((a, b) => a.at - b.at);
}

/** The stop the moment is at: the last one it has reached (else the first). */
export function stopAt(stops: TimelineStop[], position: number) {
  let found = stops[0] ?? null;
  for (const stop of stops) if (stop.at <= position + EPS) found = stop;
  return found;
}

/** The stop nearest to a moment (the pointer while scrubbing). */
export function nearestStop(stops: TimelineStop[], position: number) {
  let best: TimelineStop | null = null;
  for (const stop of stops) if (!best || Math.abs(stop.at - position) < Math.abs(best.at - position)) best = stop;
  return best;
}

/**
 * The stop a click picks: a patch mark within `reach` (positions) of the pointer,
 * else the era of the band under it (its rest), as the reader aimed at the band.
 */
export function pickStop(stops: TimelineStop[], position: number, reach: number) {
  const near = nearestStop(stops.filter((stop) => !stop.main), position);
  if (near && Math.abs(near.at - position) <= reach) return near;
  const major = Math.max(0, Math.min(SPAN - 1, Math.floor(position)));
  const inBand = stops.filter((stop) => stop.main && Math.floor(stop.at + EPS) === major);
  return inBand[0] ?? nearestStop(stops.filter((stop) => stop.main), position);
}

/** The stop one step before or after the moment (arrows); `main` steps whole eras (Page Up/Down). */
export function stepStop(stops: TimelineStop[], position: number, delta: number, main = false) {
  const list = main ? stops.filter((stop) => stop.main) : stops;
  const here = stopAt(list, position);
  const index = here ? list.indexOf(here) : -1;
  // Between two stops, a step back lands on the one just passed.
  const back = here && here.at < position - 0.001 ? index : index - 1;
  return list[Math.max(0, Math.min(list.length - 1, delta > 0 ? index + 1 : back))] ?? null;
}

/** The patch of a moment for people: 7.3, 8.3, 12.0.7 (the game writes .0 for x.0). */
export function patchLabel(patch: string) {
  const [major, minor = "0", build] = patch.split(".");
  return build && build !== "0" && !/^0[a-z]?$/.test(build) ? `${major}.${minor}.${build}` : `${major}.${minor}`;
}

/** Years of an era for people: 2004–2007, or one year. */
export const yearsOf = (era: AtlasEra | null) => (era?.years ? (era.years[0] === era.years[1] ? String(era.years[0]) : `${era.years[0]}–${era.years[1]}`) : "");

/**
 * A band's name on one line: the first candidate (the full name, then the short one players use)
 * whose measured width fits the band; the shortest when none does. Never broken over lines.
 */
export function fitLabel(candidates: string[], room: number, measure: (text: string) => number) {
  for (const text of candidates) if (measure(text) <= room) return text;
  return candidates.reduce((a, b) => (measure(b) < measure(a) ? b : a));
}
