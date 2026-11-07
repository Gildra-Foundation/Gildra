"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { ArrowUpRight, Bird, Castle, ChevronUp, Crown, DoorOpen, Expand, Flame, Hourglass, Layers as LayersIcon, Minus, Mountain, Orbit, Pickaxe, Plus, Search, Shrink, Skull, Sparkles, Swords, Tent, X } from "lucide-react";
import { lessMotion, subscribeSiteMotion } from "@gildra/atlas-ui/motionPreference";
import type { ArtEra, AtlasBundle, AtlasEra, AtlasEvent, AtlasMap, AtlasPoi, Lang } from "@/lib/wow/worldMap/bundle";
import { mapPagePath } from "@/lib/wow/worldMap/bundle";
import type { PoiKind } from "@/lib/wow/worldMap/types";
import { composeSet, mapSet, WorldMapEngine, type FrameInfo, type Insets, type MapSet } from "./engine/WorldMapEngine";
import { DEFAULT_LAYERS, indexMarkers, pickMarkers, type Layers, type Marker } from "./mapMarkers";
import { buildSearch, type SearchHit } from "./mapSearch";
import { MapTimeline } from "./MapTimeline";
import type { StageCrumb, StageHandle } from "./WorldMapStage";
import { worldMapCopy } from "./worldMapCopy";
import { artErasAt, artKey, eraAt, mapLine, orderedEras, patchPosition, restOf } from "./worldMapModel";
import styles from "./worldMapViewer.module.css";

type Selected = { type: "poi"; poi: AtlasPoi } | { type: "event"; event: AtlasEvent } | null;
type Placed = Marker & { sx: number; sy: number };

const KIND_ICON: Record<PoiKind, typeof Crown> = {
  capital: Crown, city: Castle, town: Tent, flight: Bird, portal: Orbit, dungeon: DoorOpen, raid: Skull, delve: Pickaxe, "zone-label": Castle,
};
/** Runes of world events by what happened: a land revealed, reshaped, a battle, an invasion, a new instance. */
const EVENT_ICON: Record<string, typeof Crown> = { reveal: Sparkles, reshape: Mountain, battle: Swords, invasion: Flame, instance: DoorOpen };
const LAYER_KEYS: Array<keyof Layers> = ["cities", "instances", "flight", "portals", "events", "labels", "alive"];

/** Markers are centred on their point; a capital's name hangs under its glowing seal. */
const anchor = (marker: Marker) => (marker.type === "map" && marker.capital ? "translate(-50%, -15px)" : "translate(-50%, -50%)");

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  const num = (key: string) => { const v = params.get(key); const n = v === null ? NaN : Number(v); return Number.isFinite(n) ? n : null; };
  return { era: params.get("era"), event: params.get("event"), x: num("x"), y: num("y"), z: num("z"), compare: params.get("cmp") === "1" };
}

export default function WorldMapViewer({ stage, handle, lang, mapId, homeId, bundleUrl }: {
  stage: RefObject<HTMLElement | null>; handle: RefObject<StageHandle>; lang: Lang; mapId: number | null; homeId: number | null; bundleUrl: string;
}) {
  const copy = worldMapCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WorldMapEngine | null>(null);
  const [bundle, setBundle] = useState<AtlasBundle | null>(null);
  const [failed, setFailed] = useState(false);
  const [markers, setMarkers] = useState<Placed[]>([]);
  const markerEls = useRef(new Map<string, HTMLElement>());
  const markerList = useRef<Placed[]>([]);
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [layersOpen, setLayersOpen] = useState(false);
  // The moment of the timeline (null: today) and, when comparing, the moment on the left of the divider.
  const [position, setPosition] = useState<number | null>(null);
  const [compare, setCompare] = useState<{ left: number } | null>(null);
  const [eraData, setEraData] = useState<Record<string, ArtEra>>({});
  const [activeSet, setActiveSet] = useState<MapSet | null>(null);
  const [divider, setDivider] = useState(0.5);
  const [selected, setSelected] = useState<Selected>(null);
  const [focus, setFocus] = useState<AtlasMap | null>(null);
  const [hoverMap, setHoverMap] = useState<number | null>(null);
  const [hoverPoi, setHoverPoi] = useState<AtlasPoi | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [full, setFull] = useState(false);
  const [reduced, setReduced] = useState(false);
  const routeEls = useRef<Array<SVGPathElement | null>>([]);
  const lastPick = useRef(0);
  const state = useRef({ layers, eraParam: null as string | null, metaEra: null as AtlasEra | null, selected, compare });
  const dock = useRef<HTMLDivElement>(null);
  const titleBar = useRef<HTMLElement | null>(null);

  // ------------------------------------------------------------ data
  useEffect(() => {
    let cancelled = false;
    fetch(bundleUrl).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((data: AtlasBundle) => { if (!cancelled) setBundle(data); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [bundleUrl]);

  const eras = useMemo(() => (bundle ? orderedEras(bundle.eras) : []), [bundle]);
  const latestPos = eras.length ? restOf(eras, eras[eras.length - 1]) : 0;
  const pos = position ?? latestPos;
  const era = eraAt(eras, pos);
  const art = useMemo(() => bundle?.art ?? [], [bundle]);
  const artNow = useMemo(() => artErasAt(art, pos), [art, pos]);
  const artLeft = useMemo(() => (compare ? artErasAt(art, compare.left) : []), [art, compare]);
  const baseSet = useMemo(() => (bundle ? mapSet("current", bundle.maps) : null), [bundle]);
  const sets = useRef(new Map<string, MapSet>());
  // The maps of a moment once its eras have arrived (else null and the map keeps what it shows).
  const setFor = useCallback((infos: typeof art) => {
    if (!baseSet) return null;
    if (!infos.length) return baseSet;
    const key = artKey(infos);
    const cached = sets.current.get(key);
    if (cached) return cached;
    const loaded = infos.map((info) => eraData[info.id]);
    if (loaded.some((entry) => !entry)) return null;
    const made = composeSet(key, baseSet, loaded);
    sets.current.set(key, made);
    return made;
  }, [baseSet, eraData]);
  const index = useMemo(() => {
    if (!bundle || !baseSet) return null;
    const set = activeSet ?? baseSet;
    const first = artNow[0] ? eraData[artNow[0].id] : undefined;
    const pois = first?.pois ?? bundle.pois.filter((poi) => set.maps.has(poi.map));
    // Events sit on the current maps' coordinates: shown where the era draws that map in the same place.
    // An older client draws its maps in other projections: there only maps with the current picture keep the points.
    const retailArt = !first || first.product === "wow";
    const events = bundle.events.filter((event) => {
      if (event.map === null) return false;
      const now = set.maps.get(event.map), current = baseSet.maps.get(event.map);
      if (!now || !current || !now.frame.every((v, i) => Math.abs(v - current.frame[i]) < 1e-9)) return false;
      return retailArt || now.art?.url === current.art?.url;
    });
    return indexMarkers({ maps: [...set.maps.values()], pois, events });
  }, [bundle, baseSet, activeSet, artNow, eraData]);
  const search = useMemo(() => (bundle ? buildSearch(bundle) : null), [bundle]);
  const hits = useMemo(() => (search && query ? search(query) : []), [search, query]);
  const byId = index?.byId;

  // ------------------------------------------------------------ motion preference
  useEffect(() => {
    const update = () => setReduced(lessMotion());
    update();
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", update);
    const off = subscribeSiteMotion(update);
    return () => { media.removeEventListener("change", update); off(); };
  }, []);

  // ------------------------------------------------------------ insets of the panels
  const insets = (): Insets => {
    const stageRect = stage.current?.getBoundingClientRect();
    const dockRect = dock.current?.getBoundingClientRect();
    const narrow = (stageRect?.width ?? 1000) < 700;
    const title = titleBar.current?.getBoundingClientRect();
    const bottom = stageRect && dockRect ? Math.max(0, stageRect.bottom - dockRect.top) + 8 : 120;
    let top = 0;
    if (narrow && stageRect && title) {
      // Phones: the search row sits under the title; the map fits below both.
      const searchTop = Math.round(title.bottom - stageRect.top + 8);
      handle.current?.setSearchTop(searchTop);
      top = searchTop + 52;
    }
    return { top, right: 0, bottom, left: 0 };
  };

  // ------------------------------------------------------------ engine
  const onFrame = (info: FrameInfo) => {
    const engine = engineRef.current;
    if (!engine || !index) return;
    for (const marker of markerList.current) {
      const el = markerEls.current.get(marker.key);
      if (!el) continue;
      const [sx, sy] = engine.project(marker.ax, marker.ay);
      el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) ${anchor(marker)}`;
    }
    // Flight routes of the hovered flight master.
    const poi = hoverPoiRef.current;
    if (poi?.routes) {
      const from = byIdRef.current?.get(poi.map);
      poi.routes.forEach((id, i) => {
        const path = routeEls.current[i];
        const target = poisRef.current.get(id);
        const to = target && byIdRef.current?.get(target.map);
        if (!path || !from || !target || !to) return;
        const [ax, ay] = engine.project(...engine.mapPoint(from, poi.x, poi.y));
        const [bx, by] = engine.project(...engine.mapPoint(to, target.x, target.y));
        const mx = (ax + bx) / 2, my = (ay + by) / 2 - Math.hypot(bx - ax, by - ay) * 0.22;
        path.setAttribute("d", `M${ax.toFixed(1)} ${ay.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`);
      });
    }
    const now = performance.now();
    if (now - lastPick.current > (info.moving ? 160 : 60)) {
      lastPick.current = now;
      const s = state.current;
      const next = pickMarkers(info, index, s.layers, s.metaEra, (x, y) => engine.project(x, y), (map) => map.art);
      const same = next.length === markerList.current.length && next.every((m, i) => m.key === markerList.current[i].key);
      if (!same) { markerList.current = next; setMarkers(next); }
    }
  };

  const hoverPoiRef = useRef<AtlasPoi | null>(null);
  const byIdRef = useRef(byId);
  const poisRef = useRef(new Map<string, AtlasPoi>());

  useEffect(() => {
    if (bundle) poisRef.current = new Map(bundle.pois.map((poi) => [poi.id, poi]));
  }, [bundle]);

  const settle = (info: FrameInfo) => {
    const engine = engineRef.current;
    if (!engine) return;
    const s = state.current;
    const focusMap = info.focus;
    const pathMap = focusMap.page || focusMap.id === homeId ? focusMap : engine.chain(focusMap.id).reverse().find((m) => m.page || m.id === homeId) ?? focusMap;
    const base = engine.fitMap(pathMap.id);
    if (!base) return;
    const w = pathMap.frame[2] - pathMap.frame[0], h = pathMap.frame[3] - pathMap.frame[1];
    const params = new URLSearchParams();
    const z = Math.log2(info.camera.scale / base.scale);
    const atHome = Math.abs(z) < 0.05 && Math.abs(info.camera.x - base.x) * base.scale < 8 && Math.abs(info.camera.y - base.y) * base.scale < 8;
    if (!atHome) {
      params.set("x", ((info.camera.x - pathMap.frame[0]) / w).toFixed(4));
      params.set("y", ((info.camera.y - pathMap.frame[1]) / h).toFixed(4));
      params.set("z", z.toFixed(2));
    }
    if (s.eraParam) params.set("era", s.eraParam);
    if (s.selected?.type === "event") params.set("event", s.selected.event.id);
    if (s.compare) params.set("cmp", "1");
    const path = pathMap.id === homeId ? "/wow/map" : mapPagePath(pathMap);
    const qs = params.toString();
    const url = `${prefix}${path}${qs ? `?${qs}` : ""}`;
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, "", url);
  };

  const onFocus = (chain: AtlasMap[]) => {
    const last = chain.at(-1) ?? null;
    setFocus(last);
    if (!bundle || !last) return;
    const crumbs: StageCrumb[] = [
      { label: "World of Warcraft", href: `${prefix}/wow` },
      ...chain.map((map) => ({ label: map.id === homeId ? copy.title : map.name, href: map.id === homeId ? `${prefix}/wow/map` : map.page ? `${prefix}${mapPagePath(map)}` : undefined, mapId: map.id })),
    ];
    handle.current?.setCrumbs(crumbs);
    handle.current?.setTitle(last.id === homeId ? copy.title : last.name, mapLine(lang, last, bundle));
  };

  useEffect(() => {
    if (!bundle || !canvas.current || !surface.current) return;
    titleBar.current = stage.current?.querySelector("header") ?? null;
    let engine: WorldMapEngine;
    try {
      engine = new WorldMapEngine(canvas.current, surface.current, baseSet ?? mapSet("current", bundle.maps), {
        frame: (info) => onFrameRef.current(info),
        focus: (chain) => onFocusRef.current(chain),
        hover: (map) => setHoverMap(map?.id ?? null),
        settle: (info) => settleRef.current(info),
        background: () => setSelected(null),
      }, { alive: state.current.layers.alive, reducedMotion: lessMotion(), insets: insets() });
    } catch {
      setFailed(true);
      return;
    }
    engineRef.current = engine;
    // Checks and performance probes read the viewer from the page.
    (window as Window & { __worldMap?: WorldMapEngine }).__worldMap = engine;
    const q = readQuery();
    const ordered = orderedEras(bundle.eras);
    const startEra = q.era ? ordered.find((e) => e.id === q.era) : undefined;
    if (startEra) setPosition(restOf(ordered, startEra));
    const start = mapId ?? homeId;
    const map = start === null ? undefined : engine.maps.get(start);
    if (map) {
      const fit = engine.fitMap(map.id) ?? engine.fit(map.frame);
      if (q.x !== null && q.y !== null && q.z !== null) {
        const [ax, ay] = engine.mapPoint(map, q.x, q.y);
        engine.jumpTo({ x: ax, y: ay, scale: fit.scale * 2 ** Math.max(-3, Math.min(14, q.z)) });
      } else engine.jumpTo(fit);
    }
    const event = q.event ? bundle.events.find((e) => e.id === q.event) : undefined;
    if (event) {
      setSelected({ type: "event", event });
      if (!startEra) setPosition(patchPosition(event.patch));
      if (q.compare) setCompare({ left: patchPosition(event.patch) - 0.011 });
    }
    const stageHandle = handle.current;
    stageHandle?.onCrumb((id) => engine.flyToMap(id));
    stageHandle?.ready();
    return () => {
      stageHandle?.onCrumb(null);
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one engine per bundle
  }, [bundle]);

  const onFrameRef = useRef(onFrame);
  const onFocusRef = useRef(onFocus);
  const settleRef = useRef(settle);
  // The engine calls back through refs: they follow the latest render.
  useLayoutEffect(() => {
    state.current = { layers, eraParam: position !== null && era && Math.abs(pos - latestPos) > 1e-6 ? era.id : null, metaEra: era, selected, compare };
    hoverPoiRef.current = hoverPoi;
    byIdRef.current = byId;
    onFrameRef.current = onFrame;
    onFocusRef.current = onFocus;
    settleRef.current = settle;
  });

  // Panels change size: the engine fits maps into what stays free.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const observer = new ResizeObserver(() => engine.setOptions({ insets: insets() }));
    if (dock.current) observer.observe(dock.current);
    if (titleBar.current) observer.observe(titleBar.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- insets() reads the panels from refs
  }, [bundle]);

  useEffect(() => { engineRef.current?.setOptions({ alive: layers.alive, reducedMotion: reduced }); }, [layers.alive, reduced]);
  // The eras the timeline needs come on demand (one small file each).
  useEffect(() => {
    const missing = [...artNow, ...artLeft].map((info) => info.id).filter((id) => !eraData[id]);
    if (!missing.length) return;
    let cancelled = false;
    const base = bundleUrl.replace(/\?.*$/, "");
    const version = bundleUrl.includes("?") ? bundleUrl.slice(bundleUrl.indexOf("?")) : "";
    Promise.all([...new Set(missing)].map((id) => fetch(`${base}/${id}${version}`).then((r) => (r.ok ? r.json() as Promise<ArtEra> : null)).catch(() => null)))
      .then((list) => {
        if (cancelled) return;
        const loaded = list.filter((entry): entry is ArtEra => Boolean(entry));
        if (loaded.length) setEraData((data) => ({ ...data, ...Object.fromEntries(loaded.map((entry) => [entry.id, entry])) }));
      });
    return () => { cancelled = true; };
  }, [artNow, artLeft, eraData, bundleUrl]);
  // The map follows the timeline: the moment's maps cross-fade in (at once on the first draw).
  const firstSet = useRef(true);
  useEffect(() => {
    const engine = engineRef.current;
    const set = setFor(artNow);
    if (!engine || !set) return;
    engine.setMapSet(set, !firstSet.current);
    firstSet.current = false;
    setActiveSet(set);
  }, [artNow, setFor, bundle]);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const left = compare ? setFor(artLeft) : null;
    engine.setCompare(left ? { left, at: divider } : null);
  }, [compare, divider, artLeft, setFor]);
  useEffect(() => { lastPick.current = 0; engineRef.current?.invalidate(); }, [layers, activeSet]);
  useEffect(() => { const engine = engineRef.current; if (engine?.view && engine.focus) settleRef.current({ camera: engine.view, ...engine.size, focus: engine.focus, drawn: [], moving: false, time: 0 }); }, [era?.id, position, selected, compare]);

  // ------------------------------------------------------------ actions
  const flyToPoi = useCallback((poi: AtlasPoi) => {
    const engine = engineRef.current;
    if (!engine) return;
    setSelected({ type: "poi", poi });
    const map = engine.maps.get(poi.map);
    // Points of a big map: come close enough to see the place itself.
    const zoom = map && (map.type === "continent" || map.type === "world") ? 5 : 1.8;
    engine.flyToPoint(poi.map, poi.x, poi.y, zoom);
  }, []);

  const openEvent = useCallback((event: AtlasEvent) => {
    const engine = engineRef.current;
    setSelected({ type: "event", event });
    setPosition(patchPosition(event.patch));
    if (!engine || event.map === null) return;
    const map = engine.maps.get(event.map);
    engine.flyToPoint(event.map, event.x, event.y, map && (map.type === "continent" || map.type === "world") ? 1.6 : 1.2);
  }, []);

  const pickHit = useCallback((hit: SearchHit) => {
    setQuery("");
    setSearchOpen(false);
    const engine = engineRef.current;
    if (hit.type === "map") { setSelected(null); engine?.flyToMap(hit.map.id); }
    else if (hit.type === "poi") flyToPoi(hit.poi);
    else openEvent(hit.event);
  }, [flyToPoi, openEvent]);

  // Earlier (or later) eras that draw the map in view differently: what "Compare" can show.
  const changedHere = useMemo(() => {
    if (!focus || eras.length < 2) return [] as AtlasEra[];
    const ids = new Set([focus.id, ...(focus.parent !== null ? [focus.parent] : [])]);
    const keyNow = artKey(artNow);
    const touches = (infos: typeof art) => infos.some((info) => info.changed.some((id) => ids.has(id)));
    return eras.filter((other) => {
      const infos = artErasAt(art, restOf(eras, other));
      return artKey(infos) !== keyNow && (touches(infos) || touches(artNow));
    });
  }, [focus, eras, art, artNow]);

  const toggleCompare = useCallback(() => {
    if (compare) { setCompare(null); return; }
    const event = selected?.type === "event" ? selected.event : null;
    if (event) {
      // Just before the event on the left, the event's moment on the right.
      const at = patchPosition(event.patch);
      setPosition(at);
      if (artKey(artErasAt(art, at - 0.011)) !== artKey(artErasAt(art, at))) { setCompare({ left: at - 0.011 }); return; }
      // The picture may change a little after the patch named by the event (a phase of the art): find it.
      const ids = new Set([...(event.map !== null ? [event.map] : []), ...(event.changed ?? [])]);
      const phase = art.find((info) => info.inherits && info.changed.some((id) => ids.has(id)) && patchPosition(info.range[0]) >= at && patchPosition(info.range[0]) - at < 1);
      if (phase) { const start = patchPosition(phase.range[0]); setPosition(start); setCompare({ left: start - 0.011 }); return; }
      const before = event.before ? eras.find((e) => e.id === event.before) : undefined;
      if (before) { setCompare({ left: restOf(eras, before) }); return; }
    }
    const earlier = changedHere.filter((other) => restOf(eras, other) < pos);
    const other = earlier.at(-1) ?? changedHere[0];
    if (!other) return;
    const otherPos = restOf(eras, other);
    if (otherPos < pos) setCompare({ left: otherPos });
    else { setCompare({ left: pos }); setPosition(otherPos); }
  }, [compare, selected, changedHere, eras, art, pos]);

  const toggleFull = () => {
    const el = stage.current;
    const next = !full;
    setFull(next);
    if (next && el?.requestFullscreen && !/iPhone|iPad/.test(navigator.userAgent)) el.requestFullscreen().catch(() => {});
    if (!next && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  // Full screen is drawn by the stage (fixed over the page); the browser's own full screen when it has one.
  useEffect(() => {
    handle.current?.setFull(full);
    const timer = window.setTimeout(() => engineRef.current?.resize(), 60);
    return () => window.clearTimeout(timer);
  }, [full, handle]);

  useEffect(() => {
    const exit = () => { if (!document.fullscreenElement && full) setFull(false); };
    document.addEventListener("fullscreenchange", exit);
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selected) setSelected(null);
      else if (full && !document.fullscreenElement) setFull(false);
    };
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("fullscreenchange", exit); window.removeEventListener("keydown", key); };
  }, [full, selected]);

  const startDivider = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    el.setPointerCapture(event.pointerId);
    const rect = stage.current?.getBoundingClientRect();
    const move = (e: PointerEvent) => { if (rect) setDivider(Math.max(0.04, Math.min(0.96, (e.clientX - rect.left) / rect.width))); };
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }, [stage]);

  // ------------------------------------------------------------ render
  if (failed && !bundle) return <p className={styles.fallback} data-map-ui>{copy.noWebgl}</p>;
  const selectedMap = selected?.type === "poi" ? byId?.get(selected.poi.map) : selected?.type === "event" && selected.event.map !== null ? byId?.get(selected.event.map) : undefined;
  const chainNames = (map?: AtlasMap) => {
    const out: string[] = [];
    for (let m = map; m && byId; m = m.parent === null ? undefined : byId.get(m.parent)) if (m.type !== "cosmic") out.push(m.name);
    return out.slice(0, 2).join(", ");
  };
  // The divider's tags name the pictures: the client era, or the phase of the map (Fall of Theramore).
  const artName = (infos: typeof art) => {
    const phase = focus ? infos.slice(1).find((info) => info.changed.includes(focus.id)) : undefined;
    return (phase ?? infos[0])?.name ?? era?.name ?? "";
  };
  const leftEra = compare ? { name: artName(artLeft) } : null;
  const rightEra = compare ? { name: artName(artNow) } : null;
  const patchOf = (at: number) => `${Math.floor(at) + 1}.${Math.floor((at % 1) * 10 + 1e-6)}`;
  const sameName = leftEra && rightEra && leftEra.name === rightEra.name;

  return (
    <>
      <div ref={surface} className={styles.surface} tabIndex={0} role="application" aria-label={copy.map} aria-roledescription={copy.map}
        data-alive={layers.alive && !reduced ? "" : undefined} data-ready={bundle ? "" : undefined}>
        <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
        {hoverPoi?.routes?.length ? (
          <svg className={styles.routes} aria-hidden="true">
            {hoverPoi.routes.map((id, i) => <path key={id} ref={(el) => { routeEls.current[i] = el; }} />)}
          </svg>
        ) : null}
        <div className={styles.markers}>
          {markers.map((marker) => {
            const ref = (el: HTMLElement | null) => { if (el) { markerEls.current.set(marker.key, el); el.style.transform = `translate3d(${marker.sx}px, ${marker.sy}px, 0) ${anchor(marker)}`; } else markerEls.current.delete(marker.key); };
            if (marker.type === "map") {
              return (
                <button key={marker.key} ref={ref} type="button" data-map-ui className={styles.mapLabel} data-size={marker.size} data-capital={marker.capital ? "" : undefined} data-quiet={marker.quiet ? "" : undefined}
                  data-faction={marker.faction} data-hover={hoverMap === marker.map.id ? "" : undefined}
                  onClick={() => { setSelected(null); engineRef.current?.flyToMap(marker.map.id); }}
                  onPointerEnter={() => { setHoverMap(marker.map.id); engineRef.current?.highlight(marker.map.id); }}
                  onPointerLeave={() => { setHoverMap(null); engineRef.current?.highlight(null); }}>
                  {marker.capital ? <span className={styles.glow} aria-hidden="true" /> : null}
                  <span className={styles.labelText}>{marker.label}</span>
                </button>
              );
            }
            if (marker.type === "event") {
              const Rune = EVENT_ICON[marker.event.kind ?? ""] ?? Hourglass;
              return (
                <button key={marker.key} ref={ref} type="button" data-map-ui className={styles.eventMarker} data-current={marker.current ? "" : undefined}
                  data-selected={selected?.type === "event" && selected.event.id === marker.event.id ? "" : undefined}
                  aria-label={marker.label} onClick={() => openEvent(marker.event)}>
                  <span className={styles.eventRune} aria-hidden="true"><Rune /></span>
                  <span className={styles.markerName}>{marker.label}</span>
                </button>
              );
            }
            const Icon = KIND_ICON[marker.kind];
            if (marker.kind === "zone-label") {
              return (
                <span key={marker.key} ref={ref} className={styles.mapLabel} data-size="continent" data-static="">
                  <span className={styles.labelText}>{marker.label}</span>
                </span>
              );
            }
            return (
              <button key={marker.key} ref={ref} type="button" data-map-ui className={styles.poi} data-kind={marker.kind} data-faction={marker.faction}
                data-labelled={marker.showLabel ? "" : undefined}
                data-selected={selected?.type === "poi" && selected.poi.id === marker.poi.id ? "" : undefined}
                aria-label={`${marker.label}, ${copy.kind[marker.kind]}`}
                onClick={() => { setSelected({ type: "poi", poi: marker.poi }); if (marker.poi.target) engineRef.current?.flyToMap(marker.poi.target); }}
                onPointerEnter={() => setHoverPoi(marker.poi)} onPointerLeave={() => setHoverPoi((p) => (p?.id === marker.poi.id ? null : p))}>
                <span className={styles.poiIcon} aria-hidden="true"><Icon /></span>
                <span className={styles.markerName}>{marker.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {compare && leftEra && rightEra ? (
        <div className={styles.compare} style={{ left: `${divider * 100}%` }} data-map-ui>
          <span className={styles.compareTag} data-side="left">{leftEra.name}{sameName && compare ? ` · ${patchOf(compare.left)}` : ""}</span>
          <span className={styles.compareTag} data-side="right">{rightEra.name}{sameName ? ` · ${patchOf(pos)}` : ""}</span>
          <div className={styles.compareHandle} role="slider" tabIndex={0} aria-label={copy.divider}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(divider * 100)}
            onPointerDown={startDivider}
            onKeyDown={(e) => { if (e.key === "ArrowLeft") setDivider((d) => Math.max(0.04, d - 0.04)); if (e.key === "ArrowRight") setDivider((d) => Math.min(0.96, d + 0.04)); }} />
        </div>
      ) : null}

      <div className={styles.searchBox} data-map-ui data-open={searchOpen || query ? "" : undefined}>
        <label className={styles.searchField}>
          <Search aria-hidden="true" />
          <input type="search" value={query} placeholder={copy.search} aria-label={copy.searchLabel}
            role="combobox" aria-expanded={hits.length > 0} aria-controls="world-map-hits" aria-autocomplete="list"
            aria-activedescendant={hits[active] ? `hit-${hits[active].key}` : undefined}
            onFocus={() => setSearchOpen(true)} onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === "Enter" && hits[active]) { e.preventDefault(); pickHit(hits[active]); (e.target as HTMLInputElement).blur(); }
              if (e.key === "Escape") { setQuery(""); (e.target as HTMLInputElement).blur(); }
            }} />
        </label>
        {query ? (
          <ul id="world-map-hits" role="listbox" className={styles.hits} data-map-ui-scroll>
            {hits.length ? hits.map((hit, i) => (
              <li key={hit.key} id={`hit-${hit.key}`} role="option" aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()} onClick={() => pickHit(hit)} onMouseEnter={() => setActive(i)}>
                <span className={styles.hitTitle}>{hit.title}</span>
                <span className={styles.hitMeta}>
                  {hit.type === "map" ? copy.type[hit.map.type === "zone" && byId && hit.map.parent !== null && byId.get(hit.map.parent)?.type === "zone" ? "city" : hit.map.type] : hit.type === "poi" ? copy.kind[hit.poi.kind] : `${copy.patch} ${hit.event.patch}`}
                  {hit.context && hit.type !== "event" ? ` · ${hit.context}` : ""}
                </span>
              </li>
            )) : <li className={styles.nothing} role="presentation">{copy.nothing}</li>}
          </ul>
        ) : null}
      </div>

      <div className={styles.controls} data-map-ui>
        <button type="button" onClick={() => engineRef.current?.zoomBy(1.8)} aria-label={copy.zoomIn} title={copy.zoomIn}><Plus aria-hidden="true" /></button>
        <button type="button" onClick={() => engineRef.current?.zoomBy(1 / 1.8)} aria-label={copy.zoomOut} title={copy.zoomOut}><Minus aria-hidden="true" /></button>
        <button type="button" onClick={() => engineRef.current?.up()} aria-label={copy.up} title={copy.up} disabled={!focus || (focus.parent === null && !!focus)}><ChevronUp aria-hidden="true" /></button>
        <button type="button" onClick={() => setLayersOpen((o) => !o)} aria-label={copy.layers} title={copy.layers} aria-expanded={layersOpen} aria-controls="world-map-layers"><LayersIcon aria-hidden="true" /></button>
        <button type="button" onClick={toggleFull} aria-label={full ? copy.exitFullscreen : copy.fullscreen} title={full ? copy.exitFullscreen : copy.fullscreen}>{full ? <Shrink aria-hidden="true" /> : <Expand aria-hidden="true" />}</button>
      </div>
      {layersOpen ? (
        <fieldset id="world-map-layers" className={styles.layers} data-map-ui>
          <legend>{copy.layers}</legend>
          {LAYER_KEYS.map((key) => (
            <label key={key}>
              <input type="checkbox" checked={layers[key]} onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))} />
              <span>{copy.layer[key]}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <div ref={dock} className={styles.dock} data-map-ui>
        {selected ? (
          <article className={styles.card} aria-live="polite">
            <button type="button" className={styles.cardClose} onClick={() => setSelected(null)} aria-label={copy.close}><X aria-hidden="true" /></button>
            {selected.type === "poi" ? (
              <>
                <p className={styles.cardKind}>
                  {copy.kind[selected.poi.kind]}{selected.poi.faction && selected.poi.faction !== "neutral" ? ` · ${copy.faction[selected.poi.faction]}` : ""}
                </p>
                <h2 className={styles.cardTitle}>{selected.poi.name}</h2>
                {chainNames(selectedMap) ? <p className={styles.cardText}>{chainNames(selectedMap)}</p> : null}
                {selected.poi.href ? <a className={styles.cardLink} href={`${prefix}${selected.poi.href}`}>{copy.open}<ArrowUpRight aria-hidden="true" /></a> : null}
              </>
            ) : (
              <>
                <p className={styles.cardKind}>{copy.patch} {selected.event.patch}{selected.event.year ? ` · ${selected.event.year}` : ""}</p>
                <h2 className={styles.cardTitle}>{selected.event.title}</h2>
                <p className={styles.cardText}>{selected.event.summary}</p>
                <div className={styles.cardActions}>
                  {selected.event.before || selected.event.changed?.length ? (
                    <button type="button" className={styles.cardButton} aria-pressed={Boolean(compare)} onClick={toggleCompare}>{compare ? copy.compareOff : copy.compare}</button>
                  ) : null}
                  {selected.event.links.map((link) => (
                    <a key={link.href} className={styles.cardLink} href={`${prefix}${link.href}`}>{link.label ?? copy.open}<ArrowUpRight aria-hidden="true" /></a>
                  ))}
                </div>
              </>
            )}
          </article>
        ) : null}
        {eras.length > 1 ? (
          <MapTimeline lang={lang} eras={eras} events={bundle?.events ?? []} position={pos} activeEvent={selected?.type === "event" ? selected.event : null}
            compare={Boolean(compare)} canCompare={changedHere.length > 0 || (selected?.type === "event" && Boolean(selected.event.before || selected.event.changed?.length))}
            onPosition={setPosition} onEvent={openEvent} onCompare={toggleCompare} />
        ) : null}
      </div>
      {!bundle ? <p className={styles.loading} role="status">{copy.loading}</p> : null}
    </>
  );
}
