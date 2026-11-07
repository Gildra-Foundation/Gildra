"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowUpRight, Bird, Castle, ChevronUp, Crown, DoorOpen, Expand, Hourglass, Layers as LayersIcon, Minus, Orbit, Pickaxe, Plus, Search, Shrink, Skull, Tent, X } from "lucide-react";
import { lessMotion, subscribeSiteMotion } from "@gildra/atlas-ui/motionPreference";
import type { AtlasBundle, AtlasEra, AtlasEvent, AtlasMap, AtlasPoi, Lang } from "@/lib/wow/worldMap/bundle";
import { mapPagePath } from "@/lib/wow/worldMap/bundle";
import type { PoiKind } from "@/lib/wow/worldMap/types";
import { WorldMapEngine, type FrameInfo, type Insets } from "./engine/WorldMapEngine";
import { DEFAULT_LAYERS, indexMarkers, pickMarkers, type Layers, type Marker } from "./mapMarkers";
import { buildSearch, type SearchHit } from "./mapSearch";
import { MapTimeline } from "./MapTimeline";
import type { StageCrumb, StageHandle } from "./WorldMapStage";
import { worldMapCopy } from "./worldMapCopy";
import { changedMaps, currentEra, mapLine, orderedEras } from "./worldMapModel";
import styles from "./worldMapViewer.module.css";

type Selected = { type: "poi"; poi: AtlasPoi } | { type: "event"; event: AtlasEvent } | null;
type Placed = Marker & { sx: number; sy: number };

const KIND_ICON: Record<PoiKind, typeof Crown> = {
  capital: Crown, city: Castle, town: Tent, flight: Bird, portal: Orbit, dungeon: DoorOpen, raid: Skull, delve: Pickaxe, "zone-label": Castle,
};
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
  const [eraId, setEraId] = useState<string | null>(null);
  const [compare, setCompare] = useState<{ left: string; right: string } | null>(null);
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
  const state = useRef({ layers, eraId, selected, compare });
  state.current = { layers, eraId, selected, compare };
  const dock = useRef<HTMLDivElement>(null);
  const titleBar = useRef<HTMLElement | null>(null);

  // ------------------------------------------------------------ data
  useEffect(() => {
    let cancelled = false;
    fetch(bundleUrl).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((data: AtlasBundle) => { if (!cancelled) setBundle(data); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [bundleUrl]);

  const eras = useMemo(() => (bundle ? orderedEras(bundle.eras) : []), [bundle]);
  const eraById = useMemo(() => new Map(eras.map((era) => [era.id, era])), [eras]);
  const era = (eraId ? eraById.get(eraId) : null) ?? currentEra(eras);
  const index = useMemo(() => (bundle ? indexMarkers(bundle) : null), [bundle]);
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
  const insets = useCallback((): Insets => {
    const stageRect = stage.current?.getBoundingClientRect();
    const dockRect = dock.current?.getBoundingClientRect();
    const narrow = (stageRect?.width ?? 1000) < 700;
    const title = titleBar.current?.getBoundingClientRect();
    const bottom = stageRect && dockRect ? Math.max(0, stageRect.bottom - dockRect.top) + 8 : 120;
    let top = 0;
    if (narrow && stageRect && title) {
      // Phones: the search row sits under the title; the map fits below both.
      const searchTop = Math.round(title.bottom - stageRect.top + 8);
      stage.current?.style.setProperty("--map-search-top", `${searchTop}px`);
      top = searchTop + 52;
    }
    return { top, right: 0, bottom, left: 0 };
  }, [stage]);

  // ------------------------------------------------------------ engine
  const onFrame = useCallback((info: FrameInfo) => {
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
      const eraNow = (s.eraId ? eraByIdRef.current.get(s.eraId) : null) ?? currentEraRef.current;
      const next = pickMarkers(info, index, s.layers, eraNow, (x, y) => engine.project(x, y), (map) => engine.artIn(map, eraNow));
      const same = next.length === markerList.current.length && next.every((m, i) => m.key === markerList.current[i].key);
      if (!same) { markerList.current = next; setMarkers(next); }
    }
  }, [index]);

  const hoverPoiRef = useRef<AtlasPoi | null>(null);
  hoverPoiRef.current = hoverPoi;
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const poisRef = useRef(new Map<string, AtlasPoi>());
  const eraByIdRef = useRef(eraById);
  eraByIdRef.current = eraById;
  const currentEraRef = useRef<AtlasEra | null>(null);
  currentEraRef.current = currentEra(eras);

  useEffect(() => {
    if (bundle) poisRef.current = new Map(bundle.pois.map((poi) => [poi.id, poi]));
  }, [bundle]);

  const settle = useCallback((info: FrameInfo) => {
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
    const latest = currentEraRef.current;
    if (s.eraId && s.eraId !== latest?.id) params.set("era", s.eraId);
    if (s.selected?.type === "event") params.set("event", s.selected.event.id);
    if (s.compare) params.set("cmp", "1");
    const path = pathMap.id === homeId ? "/wow/map" : mapPagePath(pathMap);
    const qs = params.toString();
    const url = `${prefix}${path}${qs ? `?${qs}` : ""}`;
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, "", url);
  }, [homeId, prefix]);

  const onFocus = useCallback((chain: AtlasMap[]) => {
    const last = chain.at(-1) ?? null;
    setFocus(last);
    if (!bundle || !last) return;
    const crumbs: StageCrumb[] = [
      { label: "World of Warcraft", href: `${prefix}/wow` },
      ...chain.map((map) => ({ label: map.id === homeId ? copy.title : map.name, href: map.id === homeId ? `${prefix}/wow/map` : map.page ? `${prefix}${mapPagePath(map)}` : undefined, mapId: map.id })),
    ];
    handle.current?.setCrumbs(crumbs);
    handle.current?.setTitle(last.id === homeId ? copy.title : last.name, mapLine(lang, last, bundle));
  }, [bundle, copy.title, handle, homeId, lang, prefix]);

  useEffect(() => {
    if (!bundle || !canvas.current || !surface.current) return;
    titleBar.current = stage.current?.querySelector("header") ?? null;
    let engine: WorldMapEngine;
    try {
      engine = new WorldMapEngine(canvas.current, surface.current, bundle, {
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
    const startEra = q.era && bundle.eras.some((e) => e.id === q.era) ? q.era : null;
    if (startEra) { setEraId(startEra); engine.setEra(bundle.eras.find((e) => e.id === startEra) ?? null, false); }
    else engine.setEra(currentEra(orderedEras(bundle.eras)), false);
    const start = mapId ?? homeId;
    const map = start === null ? undefined : engine.maps.get(start);
    if (map) {
      const fit = engine.fit(map.frame);
      if (q.x !== null && q.y !== null && q.z !== null) {
        const [ax, ay] = engine.mapPoint(map, q.x, q.y);
        engine.jumpTo({ x: ax, y: ay, scale: fit.scale * 2 ** Math.max(-3, Math.min(14, q.z)) });
      } else engine.jumpTo(fit);
    }
    const event = q.event ? bundle.events.find((e) => e.id === q.event) : undefined;
    if (event) {
      setSelected({ type: "event", event });
      if (q.compare && event.before && event.after) setCompare({ left: event.before, right: event.after });
    }
    handle.current?.onCrumb((id) => engine.flyToMap(id));
    handle.current?.ready();
    return () => {
      handle.current?.onCrumb(null);
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one engine per bundle
  }, [bundle]);

  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const settleRef = useRef(settle);
  settleRef.current = settle;

  // Panels change size: the engine fits maps into what stays free.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const observer = new ResizeObserver(() => engine.setOptions({ insets: insets() }));
    if (dock.current) observer.observe(dock.current);
    if (titleBar.current) observer.observe(titleBar.current);
    return () => observer.disconnect();
  }, [bundle, insets]);

  useEffect(() => { engineRef.current?.setOptions({ alive: layers.alive, reducedMotion: reduced }); }, [layers.alive, reduced]);
  useEffect(() => { engineRef.current?.setEra(era); engineRef.current?.invalidate(); }, [era]);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setCompare(compare ? { left: eraById.get(compare.left) ?? null, right: eraById.get(compare.right) ?? null, at: divider } : null);
  }, [compare, divider, eraById]);
  useEffect(() => { lastPick.current = 0; engineRef.current?.invalidate(); }, [layers, eraId]);
  useEffect(() => { const engine = engineRef.current; if (engine?.view && engine.focus) settleRef.current({ camera: engine.view, ...engine.size, focus: engine.focus, drawn: [], moving: false, time: 0 }); }, [eraId, selected, compare]);

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
    setEraId(event.after ?? event.era);
    if (!engine) return;
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

  const changedHere = useMemo(() => {
    if (!focus || !era || eras.length < 2) return [] as AtlasEra[];
    const ids = new Set([focus.id, ...focus.children, ...(focus.parent !== null ? [focus.parent] : [])]);
    return eras.filter((other) => other.id !== era.id && changedMaps(other, era).some((id) => ids.has(id)));
  }, [focus, era, eras]);

  const toggleCompare = useCallback(() => {
    if (compare) { setCompare(null); return; }
    const event = selected?.type === "event" ? selected.event : null;
    if (event?.before && event.after) { setCompare({ left: event.before, right: event.after }); setEraId(event.after); return; }
    const other = changedHere.at(-1) ?? eras.find((e) => e.id !== era?.id);
    if (!other || !era) return;
    const [left, right] = eras.indexOf(other) < eras.indexOf(era) ? [other, era] : [era, other];
    setCompare({ left: left.id, right: right.id });
  }, [compare, selected, changedHere, eras, era]);

  const toggleFull = useCallback(() => {
    const el = stage.current;
    if (!el) return;
    const next = !full;
    setFull(next);
    if (next) {
      el.dataset.full = "";
      if (el.requestFullscreen && !/iPhone|iPad/.test(navigator.userAgent)) el.requestFullscreen().catch(() => {});
    } else {
      delete el.dataset.full;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
    window.setTimeout(() => engineRef.current?.resize(), 60);
  }, [full, stage]);

  useEffect(() => {
    const exit = () => { if (!document.fullscreenElement && stage.current?.dataset.full !== undefined && full) { delete stage.current.dataset.full; setFull(false); window.setTimeout(() => engineRef.current?.resize(), 60); } };
    document.addEventListener("fullscreenchange", exit);
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selected) setSelected(null);
      else if (full && !document.fullscreenElement) toggleFull();
    };
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("fullscreenchange", exit); window.removeEventListener("keydown", key); };
  }, [full, selected, stage, toggleFull]);

  const startDivider = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
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
  const selectedMap = selected?.type === "poi" ? byId?.get(selected.poi.map) : selected?.type === "event" ? byId?.get(selected.event.map) : undefined;
  const chainNames = (map?: AtlasMap) => {
    const out: string[] = [];
    for (let m = map; m && byId; m = m.parent === null ? undefined : byId.get(m.parent)) if (m.type !== "cosmic") out.push(m.name);
    return out.slice(0, 2).join(", ");
  };
  const leftEra = compare ? eraById.get(compare.left) : null;
  const rightEra = compare ? eraById.get(compare.right) : null;

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
                <button key={marker.key} ref={ref} type="button" data-map-ui className={styles.mapLabel} data-size={marker.size} data-capital={marker.capital ? "" : undefined}
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
              return (
                <button key={marker.key} ref={ref} type="button" data-map-ui className={styles.eventMarker} data-current={marker.current ? "" : undefined}
                  data-selected={selected?.type === "event" && selected.event.id === marker.event.id ? "" : undefined}
                  aria-label={marker.label} onClick={() => openEvent(marker.event)}>
                  <span className={styles.eventRune} aria-hidden="true"><Hourglass /></span>
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
                onClick={() => setSelected({ type: "poi", poi: marker.poi })}
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
          <span className={styles.compareTag} data-side="left">{leftEra.name}</span>
          <span className={styles.compareTag} data-side="right">{rightEra.name}</span>
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
                  {selected.event.before && selected.event.after ? (
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
          <MapTimeline lang={lang} eras={eras} events={bundle?.events ?? []} era={era} activeEvent={selected?.type === "event" ? selected.event : null}
            compare={Boolean(compare)} canCompare={changedHere.length > 0}
            onEra={(next) => { setEraId(next.id); if (compare) setCompare(null); }} onEvent={openEvent} onCompare={toggleCompare} />
        ) : null}
      </div>
      {!bundle ? <p className={styles.loading} role="status">{copy.loading}</p> : null}
    </>
  );
}
