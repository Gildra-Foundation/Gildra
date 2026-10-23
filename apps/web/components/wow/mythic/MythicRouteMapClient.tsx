"use client";

import { routeText, sourceName, type WowNameTable } from "@/lib/wow/wowNameTable";
import Image from "next/image";
import dynamic from "next/dynamic";
import { createContext, memo, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type RefObject } from "react";
import {
  Check,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Flame,
  Import,
  LocateFixed,
  MapPinned,
  Maximize2,
  Minus,
  Minimize2,
  MoreHorizontal,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Scissors,
  Share2,
  ShieldAlert,
  Skull,
  Swords,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { AtlasBreadcrumbs } from "@gildra/atlas-ui/AtlasBreadcrumbs";
import { MythicDataNotice } from "./MythicDataNotice";
import { mythicVerificationCopy } from "./mythicVerificationCopy";
import { DungeonSourceReview } from "./DungeonSourceReview";
import { dungeonBackdropSource } from "@/lib/wow/dungeonBackdropSource";
import { MythicRouteSelectors } from "./MythicRouteSelectors";
import { AbilityIntelCard, EnemyIntelCard } from "./CombatIntelCard";
import type { DungeonRoute, DungeonSelectorOption } from "@/lib/data/wow/mythic/dungeonRoutes";
import type { DungeonCombatIntel } from "./dungeonCombatIntel.types";
import { actionLabels, floorLabel, mythicRouteCopy, plainLanguage, priorityLabels, roleLabels, stopKindLabels, stopSubtitle, targetLabel, type MythicRouteCopy, type RouteLocale, type RouteRole } from "./mythicRouteCopy";
import { routeAbilityIntel, routeEnemyIntel } from "./routeIntel";
import { RouteNamesContext, useRouteNameTable, useRouteNames } from "./routeNames";
import type { RouteStop } from "@/lib/data/wow/mythic/rubyLifePoolsData";
import styles from "./mythicRouteMap.module.css";
import { AtlasTabs } from "@gildra/atlas-ui/AtlasTabs";
import { copyText } from "@gildra/atlas-ui/clipboard";

const MdtPullMap = dynamic(() => import("./MdtPullMap"), { ssr: false, loading: () => <p role="status">MDT…</p> });

const DeferredTestPartyPanel = dynamic(
  () => import("./TestPartyPanel").then((module) => module.TestPartyPanel),
  { ssr: false, loading: () => <div className={styles.partyLoading} aria-hidden="true" /> },
);
const DeferredRouteTimelineItems = dynamic(
  () => import("./DeferredRouteTimelineItems").then((module) => module.DeferredRouteTimelineItems),
  { ssr: false, loading: () => <div className={styles.timelinePlaceholder} aria-hidden="true" /> },
);

type SavedRoute = {
  stops: RouteStop[];
  completed: number[];
  notes: Record<number, string>;
  keyLevel: number;
  deaths: number;
};

const roles: RouteRole[] = ["tank", "healer", "dps"];

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

const CompletedTimeContext = createContext(0);

function CompletedTimeValue() {
  return <>{formatTime(useContext(CompletedTimeContext))}</>;
}

function recalculateCumulative(stops: RouteStop[]) {
  let cumulative = 0;
  return stops.map((stop) => {
    cumulative += stop.forces;
    return { ...stop, cumulative: Math.round(cumulative * 10) / 10 };
  });
}

function stopTone(kind: RouteStop["kind"]) {
  if (kind === "boss") return styles.boss;
  if (kind === "miniboss") return styles.miniboss;
  if (kind === "transition") return styles.travel;
  return styles.pull;
}

function RouteEditToggle({ pageRef, copy }: { pageRef: { current: HTMLElement | null }; copy: MythicRouteCopy }) {
  const [editMode, setEditMode] = useState(false);
  const toggle = () => {
    const next = !editMode;
    pageRef.current?.setAttribute("data-route-edit-mode", String(next));
    setEditMode(next);
  };

  return <button type="button" className={styles.toolButton} aria-pressed={editMode} onClick={toggle}>
    <Pencil aria-hidden="true" /> {editMode ? copy.done : copy.edit}
  </button>;
}

function MapZoomControls({ copy, onZoomChange, expanded, onToggleExpanded }: {
  copy: MythicRouteCopy;
  onZoomChange: (zoom: number) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const changeZoom = (nextZoom: number) => {
    const boundedZoom = Math.round(Math.min(1.5, Math.max(.75, nextZoom)) * 100) / 100;
    setZoom(boundedZoom);
    onZoomChange(boundedZoom);
  };

  return <div className={styles.zoomControls} role="group" aria-label={copy.zoomGroup}>
    <button type="button" onClick={() => changeZoom(zoom - .1)} aria-label={copy.zoomOut}><Minus aria-hidden="true" /></button>
    <output><small>{copy.zoom}</small><b>{Math.round(zoom * 100)}%</b></output>
    <button type="button" onClick={() => changeZoom(zoom + .1)} aria-label={copy.zoomIn}><Plus aria-hidden="true" /></button>
    <button type="button" onClick={() => changeZoom(1)} aria-label={copy.zoomReset}><RotateCcw aria-hidden="true" /></button>
    <button type="button" onClick={onToggleExpanded} aria-label={expanded ? copy.collapseMap : copy.expandMap} aria-pressed={expanded}>{expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}</button>
  </div>;
}

const RouteStopListItem = memo(function RouteStopListItem({ stop, index, active, complete, canMoveUp, canMoveDown, locale, onSelect, onMoveSelected }: {
  stop: RouteStop;
  index: number;
  active: boolean;
  complete: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  locale: RouteLocale;
  onSelect: (stopId: number) => void;
  onMoveSelected: ((delta: -1 | 1) => void) | null;
}) {
  const copy = mythicRouteCopy[locale];
  const names = useRouteNames();
  return <li>
    <button type="button" onClick={() => onSelect(stop.id)} className={styles.stopButton} aria-pressed={active}>
      <span className={`${styles.stopIndex} ${stopTone(stop.kind)}`} data-complete={complete || undefined}>{complete ? <Check aria-hidden="true" /> : index + 1}</span>
      <span className={styles.stopCopy}>
        <b>{routeText(names, stop.title, locale)}</b>
        <small>{stopKindLabels[locale][stop.kind]} · {stopSubtitle(stop.subtitle, locale, names, stop.enemies)}</small>
        <em><Clock3 aria-hidden="true" /> ~{formatTime(stop.duration)}{stop.forces ? ` · ${copy.gives(stop.forces.toFixed(1))}` : ""}</em>
      </span>
      {stop.bloodlust ? <Flame className={styles.lustIcon} aria-label={copy.lust} /> : null}
    </button>
    {onMoveSelected ? <div className={styles.reorderButtons}><button type="button" disabled={!canMoveUp} onClick={() => onMoveSelected(-1)}>{copy.moveUp}</button><button type="button" disabled={!canMoveDown} onClick={() => onMoveSelected(1)}>{copy.moveDown}</button></div> : null}
  </li>;
});

const RouteMapMarker = memo(function RouteMapMarker({ stop, index, active, complete, onSelect, locale }: {
  stop: RouteStop;
  locale: RouteLocale;
  index: number;
  active: boolean;
  complete: boolean;
  onSelect: (stopId: number) => void;
}) {
  const names = useRouteNames();
  return <button type="button" className={`${styles.marker} ${stopTone(stop.kind)}`} data-equivalent-targets data-active={active || undefined} data-complete={complete || undefined} style={{ left: `${stop.x}%`, top: `${stop.y}%` }} onClick={() => onSelect(stop.id)} aria-label={`${index + 1}. ${routeText(names, stop.title, locale)}`} aria-pressed={active}>{complete ? <Check aria-hidden="true" /> : index + 1}{stop.bloodlust ? <Flame aria-hidden="true" /> : null}</button>;
});

const RouteNoteField = memo(function RouteNoteField({ copy, initialValue, onChange, noteRef }: {
  copy: MythicRouteCopy;
  initialValue: string;
  onChange: (value: string) => void;
  noteRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [draft, setDraft] = useState(initialValue);
  useEffect(() => setDraft(initialValue), [initialValue]);

  return <label className={styles.note}>
    <span>{copy.noteLabel}</span>
    <textarea
      ref={noteRef}
      value={draft}
      onChange={(event) => {
        const value = event.target.value;
        setDraft(value);
        onChange(value);
      }}
      placeholder={copy.notePlaceholder}
    />
  </label>;
});

const RouteStepNarrative = memo(function RouteStepNarrative({ locale, dungeon, dungeonName, selected, role, combatIntel, onRoleChange }: {
  locale: RouteLocale;
  dungeon: DungeonRoute;
  dungeonName: string;
  selected: RouteStop;
  role: RouteRole;
  combatIntel: DungeonCombatIntel;
  onRoleChange: (role: RouteRole) => void;
}) {
  const copy = mythicRouteCopy[locale];
  const names = useRouteNames();
  // Hand-written Ruby Life Pools notes are Russian; English pages use the generated English intel.
  const handWritten = dungeon.slug === "ruby-life-pools" && locale === "ru";
  const enemyCount = selected.enemies.reduce((total, enemy) => total + enemy.count, 0);
  return <>
    <p className={styles.detailDescription}>{plainLanguage(selected.summary, locale, names)}</p>
    <section className={styles.detailSection}>
      <h3>{copy.enemiesTitle} <b>{copy.enemiesCount(enemyCount)}</b></h3>
      {selected.enemies.length ? <ul className={styles.intelList}>{selected.enemies.map((enemy) => {
        const data = combatIntel.enemies[enemy.name];
        const intel = handWritten ? data?.intel : routeEnemyIntel(enemy, selected, dungeonName, locale);
        return <EnemyIntelCard key={enemy.name} locale={locale} dungeonName={dungeonName} encounter={routeText(names, selected.title, locale)} name={enemy.name} count={enemy.count} priority={enemy.priority} priorityLabel={priorityLabels[locale][enemy.priority]} summary={intel?.summary} danger={intel?.danger} media={data?.media} icon={<span className={styles.intelInitial}>{enemy.name.slice(0, 1)}</span>} />;
      })}</ul> : <p className={styles.emptyNote}>{copy.noFight}</p>}
    </section>
    <section className={styles.detailSection}>
      <h3>{copy.abilitiesTitle}</h3>
      {selected.abilities.length ? <ul className={styles.intelList}>{selected.abilities.map((ability) => {
        const data = combatIntel.abilities[ability.name];
        const intel = handWritten ? data?.intel : routeAbilityIntel(ability, selected, locale);
        return <AbilityIntelCard key={ability.name} locale={locale} name={ability.name} action={actionLabels[locale][ability.action]} interrupt={ability.action === "Кик"} dispel={ability.action === "Диспел" || ability.action === "Пурж"} responsible={targetLabel(ability.target, locale)} source={ability.source ?? data?.source} encounter={routeText(names, selected.title, locale)} effect={intel?.effect} failure={intel?.failure} media={data?.media} icon={<span className={styles.intelInitial}>{ability.name.slice(0, 1)}</span>} />;
      })}</ul> : <p className={styles.emptyNote}>{copy.noAbilities}</p>}
    </section>
    <section className={styles.detailSection}>
      <h3>{copy.calloutsTitle}</h3>
      <ul className={styles.callouts}>{selected.callouts.map((callout) => <li key={callout}>{plainLanguage(callout, locale, names)}</li>)}</ul>
    </section>
    <AtlasTabs
      className={styles.roleTabs}
      variant="segmented"
      label={copy.rolesLabel}
      value={role}
      onChange={(id) => onRoleChange(id as RouteRole)}
      tabs={roles.map((item) => ({ id: item, label: roleLabels[locale][item], content: <p className={styles.roleText}>{plainLanguage(selected[item], locale, names)}</p> }))}
    />
  </>;
});

const RouteDetails = memo(function RouteDetails({ locale, dungeon, dungeonName, selected, selectedIndex, totalSteps, isComplete, role, note, noteRef, noteRevision, combatIntel, onRoleChange, onNoteChange, onFocusNote, onSplitPull, onToggleComplete, onSaveRoute, onShareRoute }: {
  locale: RouteLocale;
  dungeon: DungeonRoute;
  dungeonName: string;
  selected: RouteStop;
  selectedIndex: number;
  totalSteps: number;
  isComplete: boolean;
  role: RouteRole;
  note: string;
  noteRef: RefObject<HTMLTextAreaElement | null>;
  noteRevision: number;
  combatIntel: DungeonCombatIntel;
  onRoleChange: (role: RouteRole) => void;
  onNoteChange: (value: string) => void;
  onFocusNote: () => void;
  onSplitPull: () => void;
  onToggleComplete: () => void;
  onSaveRoute: () => void;
  onShareRoute: () => void;
}) {
  const copy = mythicRouteCopy[locale];
  const names = useRouteNames();
  return <aside className={`${styles.panel} ${styles.details}`} aria-live="polite">
    <div className={styles.detailTop}><p>{copy.nowStep(selectedIndex + 1, totalSteps)}</p><span className={`${styles.kindTag} ${stopTone(selected.kind)}`}>{stopKindLabels[locale][selected.kind]}</span></div>
    <div key={selected.id} className={styles.detailHeading}><span className={`${styles.stopIndex} ${stopTone(selected.kind)}`}>{selectedIndex + 1}</span><div><h2>{routeText(names, selected.title, locale)}</h2><p>{copy.stepMeta(formatTime(selected.duration), selected.forces.toFixed(1), selected.cumulative.toFixed(1))}</p></div></div>
    <RouteStepNarrative locale={locale} dungeon={dungeon} dungeonName={dungeonName} selected={selected} role={role} combatIntel={combatIntel} onRoleChange={onRoleChange} />
    <button type="button" className={styles.primaryButton} onClick={onToggleComplete}>{isComplete ? <Undo2 aria-hidden="true" /> : <Check aria-hidden="true" />}{isComplete ? copy.reopenStep : copy.completeStep}</button>
    {/* Secondary step tools fold away so the panel reads first; a step with a note keeps them open. */}
    <details className={styles.stepTools} open={Boolean(note) || undefined}>
      <summary>{copy.stepTools}</summary>
      <div className={styles.buttonRow}><button type="button" className={styles.toolButton} onClick={onSplitPull}><Scissors aria-hidden="true" /> {copy.splitPull}</button><button type="button" className={styles.toolButton} onClick={onFocusNote}><Pencil aria-hidden="true" /> {copy.addNote}</button></div>
      <RouteNoteField key={`${selected.id}-${noteRevision}`} copy={copy} initialValue={note} onChange={onNoteChange} noteRef={noteRef} />
      <div className={styles.buttonRow}><button type="button" className={styles.toolButton} onClick={onSaveRoute}><Save aria-hidden="true" /> {copy.save}</button><button type="button" className={styles.toolButton} onClick={onShareRoute}><Copy aria-hidden="true" /> {copy.link}</button></div>
    </details>
    <div className={styles.resourceLinks}><a href={dungeon.mdtRouteUrl} target="_blank" rel="noreferrer">{copy.communityRoutes} <ExternalLink aria-hidden="true" /></a><a href={dungeon.guideUrl} target="_blank" rel="noreferrer">{copy.guide} <ExternalLink aria-hidden="true" /></a></div>
  </aside>;
});

function RouteInteractionLayer({
  locale,
  dungeon,
  dungeonName,
  combatIntel,
  stops,
  completed,
  completedForces,
  completedTime,
  completion,
  noteDrafts,
  noteRevision,
  noteRef,
  initialSelectedId,
  selectedIdRef,
  selectStopRef,
  onSelectedStopChange,
  moveSelected,
  splitPull,
  toggleComplete,
  saveRoute,
  shareRoute,
  updateNote,
  focusNote,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  locale: RouteLocale;
  dungeon: DungeonRoute;
  dungeonName: string;
  combatIntel: DungeonCombatIntel;
  stops: RouteStop[];
  completed: number[];
  completedForces: number;
  completedTime: number;
  completion: number;
  noteDrafts: { current: Record<number, string> };
  noteRevision: number;
  noteRef: RefObject<HTMLTextAreaElement | null>;
  initialSelectedId: number;
  selectedIdRef: { current: number };
  selectStopRef: { current: (id: number) => void };
  onSelectedStopChange: (id: number) => void;
  moveSelected: (delta: -1 | 1) => void;
  splitPull: () => void;
  toggleComplete: () => void;
  saveRoute: () => void;
  shareRoute: () => void;
  updateNote: (stopId: number, value: string) => void;
  focusNote: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const copy = mythicRouteCopy[locale];
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [floor, setFloor] = useState(dungeon.floors[0].id);
  const [role, setRole] = useState<RouteRole>("tank");
  const [mapExpanded, setMapExpanded] = useState(false);
  const [partyPanelMounted, setPartyPanelMounted] = useState(false);
  const [routeTimelineReady, setRouteTimelineReady] = useState(false);
  const mapCanvasRef = useRef<HTMLDivElement>(null);
  const routeTimelineRef = useRef<HTMLElement>(null);
  const [, startTransition] = useTransition();
  const updateMapZoom = useCallback((zoom: number) => {
    mapCanvasRef.current?.style.setProperty("--map-zoom", String(zoom));
  }, []);
  const stopIndexById = useMemo(() => new Map(stops.map((stop, index) => [stop.id, index])), [stops]);
  const completedStopIds = useMemo(() => new Set(completed), [completed]);
  const selected = stops.find((stop) => stop.id === selectedId) ?? stops[0];
  const filteredStops = useMemo(() => stops.filter((stop) => stop.floor === floor), [floor, stops]);
  const routePoints = useMemo(() => filteredStops.map((stop) => `${stop.x},${stop.y}`).join(" "), [filteredStops]);
  const updateSelectedNote = useCallback((value: string) => updateNote(selected.id, value), [selected.id, updateNote]);
  const selectStop = useCallback((id: number) => {
    const nextStop = stops.find((stop) => stop.id === id);
    onSelectedStopChange(id);
    setSelectedId(id);
    if (nextStop && nextStop.floor !== floor) setFloor(nextStop.floor);
  }, [floor, onSelectedStopChange, stops]);
  selectStopRef.current = selectStop;

  // The map follows the selected step, but a manual floor switch must not snap back.
  useEffect(() => {
    const requestedId = selectedIdRef.current;
    if (requestedId !== selectedId) setSelectedId(requestedId);
    const requestedStop = stops.find((stop) => stop.id === requestedId);
    if (requestedStop) setFloor(requestedStop.floor);
  }, [selectedId, selectedIdRef, stops]);

  useEffect(() => {
    if (routeTimelineReady) return;
    const target = routeTimelineRef.current;
    if (!target) return;
    if (!("IntersectionObserver" in window)) {
      setRouteTimelineReady(true);
      return;
    }
    let scrollIdleTimer: number | null = null;
    const revealAfterScrollIdle = () => {
      if (scrollIdleTimer !== null) window.clearTimeout(scrollIdleTimer);
      scrollIdleTimer = window.setTimeout(() => {
        scrollIdleTimer = null;
        window.removeEventListener("scroll", revealAfterScrollIdle, true);
        setRouteTimelineReady(true);
      }, 180);
    };
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      window.addEventListener("scroll", revealAfterScrollIdle, { capture: true, passive: true });
      revealAfterScrollIdle();
    }, { rootMargin: "400px 0px" });
    observer.observe(target);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", revealAfterScrollIdle, true);
      if (scrollIdleTimer !== null) window.clearTimeout(scrollIdleTimer);
    };
  }, [routeTimelineReady]);

  const mountPartyPanel = useCallback(() => {
    startTransition(() => setPartyPanelMounted(true));
  }, [startTransition]);

  useEffect(() => {
    if (!mapExpanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMapExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mapExpanded]);

  // Each column sits in its own Suspense boundary so React hydrates them as
  // separate, interruptible chunks instead of one long main-thread task.
  const workspace = useMemo(() => (
    <section className={styles.workspace} aria-label={copy.plannerLabel(dungeonName)}>
      <Suspense fallback={null}>
        <aside className={`${styles.panel} ${styles.stops}`}>
          <header className={styles.panelHeader}><h2>{copy.stepsTitle}</h2><b>{completed.length}/{stops.length}</b></header>
          <ol>
            {stops.map((stop, index) => <RouteStopListItem
              key={stop.id}
              stop={stop}
              index={index}
              active={selectedId === stop.id}
              complete={completedStopIds.has(stop.id)}
              canMoveUp={index > 0}
              canMoveDown={index < stops.length - 1}
              locale={locale}
              onSelect={selectStop}
              onMoveSelected={moveSelected}
            />)}
          </ol>
          <div className={styles.progress}><span>{copy.routeDone}</span><b>{completion}%</b><i><em style={{ width: `${completion}%` }} /></i></div>
          <p className={styles.sourceNote}>{copy.spent} <CompletedTimeValue /> · {copy.defeated(completedForces.toFixed(1))}</p>
        </aside>
      </Suspense>

      <Suspense fallback={null}>
        <div className={`${styles.panel} ${styles.mapPanel}`} data-expanded={mapExpanded || undefined}>
          <div className={styles.mapHeader}>
            <div className={styles.mapIdentity}>
              <h2><LocateFixed aria-hidden="true" /> {copy.mapTitle}</h2>
              <small>{copy.currentTarget((stopIndexById.get(selectedId) ?? 0) + 1, stops.length)} · {copy.mapHint}</small>
            </div>
            <div className={styles.mapCommandDeck}>
              {dungeon.floors.length > 1 ? <div className={styles.floorTabs} role="group" aria-label={copy.floorGroup}>
                <span aria-hidden="true">{copy.floor}</span>
                {dungeon.floors.map((item) => <button key={item.id} type="button" onClick={() => setFloor(item.id)} aria-pressed={floor === item.id}><b>{copy.floorMarker(item.id)}</b>{floorLabel(item.label, locale) ? <small>{floorLabel(item.label, locale)}</small> : null}</button>)}
              </div> : null}
              <MapZoomControls
                copy={copy}
                onZoomChange={updateMapZoom}
                expanded={mapExpanded}
                onToggleExpanded={() => setMapExpanded((value) => !value)}
              />
            </div>
          </div>
          <div className={styles.mapViewport}>
            <div className={styles.mapCanvas} ref={mapCanvasRef}>
              <Image key={dungeon.mapImage} src={dungeon.mapImage} width={1002} height={668} sizes="(max-width: 1023px) calc(100vw - 48px), (max-width: 1279px) calc(100vw - 80px), (max-width: 1540px) calc(100vw - 760px), 780px" alt={copy.mapAlt(dungeonName, floor)} />
              <svg className={styles.routeLine} data-testid="route-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline className={styles.routeGlow} points={routePoints} /><polyline className={styles.routePath} points={routePoints} /></svg>
              {filteredStops.map((stop) => <RouteMapMarker locale={locale}
                key={stop.id}
                stop={stop}
                index={stopIndexById.get(stop.id) ?? 0}
                active={selectedId === stop.id}
                complete={completedStopIds.has(stop.id)}
                onSelect={selectStop}
              />)}
            </div>
          </div>
          <footer className={styles.mapFooter}>
            <div className={styles.mapLegend}><span><i className={styles.pull} /> {stopKindLabels[locale].pull}</span><span><i className={styles.miniboss} /> {stopKindLabels[locale].miniboss}</span><span><i className={styles.boss} /> {stopKindLabels[locale].boss}</span></div>
            <div className={styles.mapFooterProgress} aria-label={copy.completedPercent(completion)}><span><b>{completion}%</b> {copy.passed}</span><i><em style={{ width: `${completion}%` }} /></i></div>
            <a href={dungeon.guideUrl} target="_blank" rel="noreferrer">{copy.guide} <ExternalLink aria-hidden="true" /></a>
          </footer>
        </div>
      </Suspense>

      <Suspense fallback={null}>
        <RouteDetails locale={locale} dungeon={dungeon} dungeonName={dungeonName} selected={selected} selectedIndex={stopIndexById.get(selected.id) ?? 0} totalSteps={stops.length} isComplete={completedStopIds.has(selected.id)} role={role} note={noteDrafts.current[selected.id] ?? ""} noteRef={noteRef} noteRevision={noteRevision} combatIntel={combatIntel} onRoleChange={setRole} onNoteChange={updateSelectedNote} onFocusNote={focusNote} onSplitPull={splitPull} onToggleComplete={toggleComplete} onSaveRoute={saveRoute} onShareRoute={shareRoute} />
      </Suspense>
    </section>
  ), [
    combatIntel, completed, completedForces, completion, copy, dungeon, dungeonName, filteredStops, floor,
    focusNote, locale, mapExpanded, moveSelected, noteDrafts, noteRef, noteRevision, role, routePoints, saveRoute, selected, selectedId, selectStop,
    stopIndexById, completedStopIds, updateSelectedNote, shareRoute,
    splitPull, stops, toggleComplete, updateMapZoom,
  ]);

  return <CompletedTimeContext.Provider value={completedTime}>
    {workspace}
    <section ref={routeTimelineRef} className={styles.panel} aria-labelledby="route-timeline-title">
      <header className={styles.panelHeader}><h2 id="route-timeline-title"><MapPinned aria-hidden="true" /> {copy.timelineTitle}</h2><div className={styles.buttonRow}><button type="button" className={styles.toolButton} onClick={onUndo} disabled={!canUndo}><Undo2 aria-hidden="true" /> {copy.undo}</button><button type="button" className={styles.toolButton} onClick={onRedo} disabled={!canRedo}><Redo2 aria-hidden="true" /> {copy.redo}</button></div></header>
      {routeTimelineReady ? <DeferredRouteTimelineItems locale={locale} stops={stops} selectedId={selectedId} onSelect={selectStop} /> : <div className={styles.timelinePlaceholder} aria-hidden="true" />}
    </section>
    {partyPanelMounted
      ? <DeferredTestPartyPanel locale={locale} routeStops={stops} selectedStop={selected} onSelectStop={selectStop} />
      : <section className={`${styles.panel} ${styles.partyTeaser}`} aria-labelledby="party-teaser-title">
        <Users aria-hidden="true" />
        <div><h2 id="party-teaser-title">{copy.partyTeaserTitle}</h2><p>{copy.partyTeaserText}</p></div>
        <button type="button" className={styles.primaryButton} onClick={mountPartyPanel}>{copy.openParty}</button>
      </section>}
  </CompletedTimeContext.Provider>;
}

export function MythicRouteMapClient({ locale, dungeon, dungeonOptions, combatIntel, names: pageNames }: { locale: RouteLocale; dungeon: DungeonRoute; dungeonOptions: DungeonSelectorOption[]; combatIntel: DungeonCombatIntel; names: WowNameTable }) {
  const copy = mythicRouteCopy[locale];
  const initialStops = dungeon.stops;
  const storageKey = `gildra:mythic:${dungeon.slug}:v3`;
  const timerSeconds = dungeon.timerSeconds;
  const localePrefix = locale === "ru" ? "/ru" : "";
  const [stops, setStops] = useState<RouteStop[]>(initialStops);
  const names = useRouteNameTable(locale, pageNames, initialStops, stops);
  const dungeonName = sourceName(names, dungeon.name, locale, dungeon.nameRu);
  const [completed, setCompleted] = useState<number[]>([]);
  const noteDraftsRef = useRef<Record<number, string>>({});
  const [noteRevision, setNoteRevision] = useState(0);
  const [keyLevel, setKeyLevel] = useState(12);
  const [deaths, setDeaths] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importValue, setImportValue] = useState("");
  const [message, setMessage] = useState("");
  const [undoStack, setUndoStack] = useState<RouteStop[][]>([]);
  const [redoStack, setRedoStack] = useState<RouteStop[][]>([]);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const messageTimer = useRef<number | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef(initialStops[0].id);
  const selectStopRef = useRef<(id: number) => void>(() => {});
  const routeSnapshot = useRef({ stops, completed, notes: noteDraftsRef.current, keyLevel, deaths, selectedId: selectedIdRef.current });
  routeSnapshot.current = { stops, completed, notes: noteDraftsRef.current, keyLevel, deaths, selectedId: selectedIdRef.current };
  const onSelectedStopChange = useCallback((id: number) => {
    selectedIdRef.current = id;
    routeSnapshot.current.selectedId = id;
  }, []);

  const totalDuration = useMemo(() => stops.reduce((total, stop) => total + stop.duration, 0) + deaths * 15, [deaths, stops]);
  const completedStops = useMemo(() => {
    const ids = new Set(completed);
    return stops.filter((stop) => ids.has(stop.id));
  }, [completed, stops]);
  const completedForces = useMemo(() => completedStops.reduce((total, stop) => total + stop.forces, 0), [completedStops]);
  const completedTime = useMemo(() => completedStops.reduce((total, stop) => total + stop.duration, 0) + deaths * 15, [completedStops, deaths]);
  const completion = Math.round((completed.length / stops.length) * 100);
  const reserveSeconds = Math.max(0, timerSeconds - totalDuration);
  const bossCount = useMemo(() => initialStops.filter((stop) => stop.kind === "boss").length, [initialStops]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as SavedRoute | null;
      if (saved?.stops?.length && saved.stops.every((stop) => Array.isArray(stop.enemies) && Array.isArray(stop.abilities))) {
        setStops(saved.stops);
        setCompleted(saved.completed ?? []);
        noteDraftsRef.current = saved.notes ?? {};
        setNoteRevision((revision) => revision + 1);
        setKeyLevel(saved.keyLevel ?? 12);
        setDeaths(saved.deaths ?? 0);
      }
    } catch {
      // A malformed local route must not block the dungeon planner.
    }
  }, [storageKey]);

  useEffect(() => () => {
    if (messageTimer.current !== null) window.clearTimeout(messageTimer.current);
  }, []);

  useEffect(() => {
    pageRef.current?.setAttribute("data-interactive", "true");
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event.type === "pointerdown" && moreMenuRef.current?.contains(event.target as Node)) return;
      setMoreOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [moreOpen]);

  const announce = useCallback((value: string) => {
    if (messageTimer.current !== null) window.clearTimeout(messageTimer.current);
    setMessage(value);
    messageTimer.current = window.setTimeout(() => {
      setMessage("");
      messageTimer.current = null;
    }, 2400);
  }, []);
  const commitStops = useCallback((nextStops: RouteStop[]) => {
    setUndoStack((history) => [...history.slice(-19), routeSnapshot.current.stops]);
    setRedoStack([]);
    setStops(recalculateCumulative(nextStops));
  }, []);

  const saveRoute = useCallback(() => {
    const { stops, completed, notes, keyLevel, deaths } = routeSnapshot.current;
    window.localStorage.setItem(storageKey, JSON.stringify({ stops, completed, notes, keyLevel, deaths } satisfies SavedRoute));
    announce(copy.saved);
  }, [announce, copy, storageKey]);

  function resetRoute() {
    setStops(initialStops);
    selectStopRef.current(initialStops[0].id);
    setCompleted([]);
    noteDraftsRef.current = {};
    setNoteRevision((revision) => revision + 1);
    routeSnapshot.current.notes = noteDraftsRef.current;
    setDeaths(0);
    setKeyLevel(12);
    setUndoStack([]);
    setRedoStack([]);
    setMoreOpen(false);
    window.localStorage.removeItem(storageKey);
    announce(copy.resetDone);
  }

  const moveSelected = useCallback((delta: -1 | 1) => {
    const { stops, selectedId } = routeSnapshot.current;
    const selectedIndex = stops.findIndex((stop) => stop.id === selectedId);
    const nextIndex = selectedIndex + delta;
    if (nextIndex < 0 || nextIndex >= stops.length) return;
    const nextStops = [...stops];
    [nextStops[selectedIndex], nextStops[nextIndex]] = [nextStops[nextIndex], nextStops[selectedIndex]];
    commitStops(nextStops);
  }, [commitStops]);

  function undoRoute() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((history) => [...history, stops]);
    setUndoStack((history) => history.slice(0, -1));
    setStops(previous);
    announce(copy.undone);
  }

  function redoRoute() {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((history) => [...history, stops]);
    setRedoStack((history) => history.slice(0, -1));
    setStops(next);
    announce(copy.redone);
  }

  const splitPull = useCallback(() => {
    const { stops, selectedId } = routeSnapshot.current;
    const selected = stops.find((stop) => stop.id === selectedId) ?? stops[0];
    const selectedIndex = stops.findIndex((stop) => stop.id === selected.id);
    if (selected.kind !== "pull" || selected.forces <= 0) {
      announce(copy.splitOnlyPulls);
      return;
    }
    const newId = Math.max(...stops.map((stop) => stop.id)) + 1;
    const firstForces = Math.round((selected.forces / 2) * 10) / 10;
    const secondForces = Math.round((selected.forces - firstForces) * 10) / 10;
    const firstDuration = Math.ceil(selected.duration / 2);
    const secondDuration = selected.duration - firstDuration;
    const firstEnemies = selected.enemies.map((enemy) => ({ ...enemy, count: Math.ceil(enemy.count / 2) })).filter((enemy) => enemy.count > 0);
    const secondEnemies = selected.enemies.map((enemy) => ({ ...enemy, count: Math.floor(enemy.count / 2) })).filter((enemy) => enemy.count > 0);
    const first = { ...selected, title: `${selected.title} · A`, duration: firstDuration, forces: firstForces, enemies: firstEnemies };
    const second = { ...selected, id: newId, title: `${selected.title} · B`, x: Math.min(92, selected.x + 3), y: Math.max(8, selected.y - 3), duration: secondDuration, forces: secondForces, enemies: secondEnemies };
    const nextStops = [...stops];
    nextStops.splice(selectedIndex, 1, first, second);
    commitStops(nextStops);
    selectStopRef.current(newId);
    announce(copy.splitDone);
  }, [announce, commitStops, copy]);

  const toggleComplete = useCallback(() => {
    const selectedId = routeSnapshot.current.selectedId;
    setCompleted((current) => current.includes(selectedId) ? current.filter((id) => id !== selectedId) : [...current, selectedId]);
  }, []);

  const shareRoute = useCallback(async () => {
    const { keyLevel, selectedId } = routeSnapshot.current;
    const url = new URL(window.location.href);
    url.searchParams.set("key", String(keyLevel));
    url.searchParams.set("pull", String(selectedId));
    try {
      await copyText(url.toString());
      announce(copy.linkCopied);
    } catch {
      window.prompt(copy.copyLinkPrompt, url.toString());
    }
  }, [announce, copy]);

  const updateNote = useCallback((stopId: number, value: string) => {
    noteDraftsRef.current[stopId] = value;
  }, []);
  // The note lives in the folded step tools: open them before focusing it.
  const focusNote = useCallback(() => {
    const tools = noteRef.current?.closest("details");
    if (tools && !tools.open) tools.open = true;
    noteRef.current?.focus();
  }, []);

  function exportRoute() {
    const payload = JSON.stringify({ dungeon: dungeon.name, dungeonSlug: dungeon.slug, keyLevel, stops, notes: noteDraftsRef.current }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `gildra-${dungeon.slug}-route.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMoreOpen(false);
    announce(copy.jsonDownloaded);
  }

  function importRoute() {
    try {
      const parsed = JSON.parse(importValue) as RouteStop[] | { stops?: RouteStop[] };
      const importedStops = Array.isArray(parsed) ? parsed : parsed.stops;
      if (!importedStops?.length || !importedStops.every((stop) => typeof stop.title === "string" && Array.isArray(stop.enemies))) throw new Error("invalid");
      commitStops(importedStops);
      selectStopRef.current(importedStops[0].id);
      setImportValue("");
      setImportOpen(false);
      announce(copy.imported);
    } catch {
      announce(copy.importFailed);
    }
  }

  return (
    <RouteNamesContext.Provider value={names}>
    <main
      ref={pageRef}
      className={styles.page}
      data-dungeon={dungeon.slug}
      style={{ "--dungeon-backdrop": `url("${dungeonBackdropSource(dungeon)}")` } as CSSProperties}
    >
      <div className={styles.backdrop} data-testid="dungeon-backdrop" aria-hidden="true" />
      <div className={styles.column}>
        <div className={styles.crumbsRow}>
          <AtlasBreadcrumbs label={copy.breadcrumbsLabel} items={[{ label: copy.hub, href: `${localePrefix}/wow/mythic-plus` }, { label: dungeonName }]} />
          <span className={styles.season}>{copy.season}</span>
        </div>

        <section className={styles.intro} aria-labelledby="route-title">
          <div className={styles.introIdentity}>
            <p className={styles.eyebrow}>{copy.eyebrow(dungeon.location)}</p>
            <div className={styles.titleRow}>
              <h1 id="route-title">{dungeonName}</h1>
              <span className={styles.keyTag} aria-label={`${copy.keyLevelLabel} +${keyLevel}`}>+{keyLevel}</span>
            </div>
            <p className={styles.description}><strong>{copy.goal}</strong> {copy.goalText(dungeon.description, bossCount)}</p>
          </div>
          <div className={styles.routeControls} role="group" aria-label={copy.controlsLabel}>
            <div className={styles.selectorRow}>
              <MythicRouteSelectors locale={locale} dungeonSlug={dungeon.slug} dungeonOptions={dungeonOptions} keyLevel={keyLevel} onKeyLevelChange={setKeyLevel} />
            </div>

          </div>
        </section>

        <DungeonSourceReview review={combatIntel.review} locale={locale} />
        <div className={styles.panel}><MdtPullMap key={dungeon.slug} slug={dungeon.slug} locale={locale} routeUrl={dungeon.mdtRouteUrl} data={combatIntel.mdt} stops={dungeon.stops} combatIntel={combatIntel} /></div>
        <details className={styles.legacyDraft}>
          <summary>{mythicVerificationCopy[locale].legacyEditor}</summary>
        <MythicDataNotice locale={locale} route />
            <div className={styles.buttonRow}>
              <RouteEditToggle pageRef={pageRef} copy={copy} />
              <button type="button" className={styles.toolButton} onClick={shareRoute}><Share2 aria-hidden="true" /> {copy.share}</button>
              <button type="button" className={styles.toolButton} onClick={() => setImportOpen(true)}><Import aria-hidden="true" /> {copy.import}</button>
              <div ref={moreMenuRef} className={styles.moreMenu}>
                <button type="button" className={styles.toolButton} aria-label={copy.moreActions} aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}><MoreHorizontal aria-hidden="true" /></button>
                {moreOpen ? <div className={styles.moreList}><button type="button" onClick={exportRoute}><Download aria-hidden="true" /> {copy.downloadJson}</button><button type="button" onClick={resetRoute}><RotateCcw aria-hidden="true" /> {copy.resetRoute}</button></div> : null}
              </div>
            </div>

        <section className={styles.runSummary} aria-label={copy.summaryLabel}>
          <article><span><Clock3 aria-hidden="true" /> {copy.timer}</span><b>{formatTime(timerSeconds)}</b><small className={totalDuration <= timerSeconds ? styles.positive : styles.negative}>{copy.plan(formatTime(totalDuration), formatTime(reserveSeconds))}</small></article>
          <article><span><Swords aria-hidden="true" /> {copy.forcesDone}</span><b>{completedForces.toFixed(1)}%</b><small>{copy.forcesGoal}</small></article>
          <article><span><Skull aria-hidden="true" /> {copy.deaths}</span><div className={styles.deathControl}><button type="button" onClick={() => setDeaths((value) => Math.max(0, value - 1))} aria-label={copy.removeDeath}><Minus aria-hidden="true" /></button><b>{deaths}</b><button type="button" onClick={() => setDeaths((value) => value + 1)} aria-label={copy.addDeath}><Plus aria-hidden="true" /></button></div><small>{copy.deathPenalty}</small></article>
          <article><span><ShieldAlert aria-hidden="true" /> {copy.conditions}</span><div className={styles.affixes}><button type="button" title={copy.tyrannicalTitle} onClick={() => announce(copy.tyrannicalNote)}>{copy.tyrannical}</button><button type="button" title={copy.seasonAffixTitle} onClick={() => announce(copy.seasonAffixNote)}>{copy.seasonAffix}</button></div><small>{copy.conditionsHint}</small></article>
        </section>

        <RouteInteractionLayer
          locale={locale}
          dungeon={dungeon}
          dungeonName={dungeonName}
          combatIntel={combatIntel}
          stops={stops}
          completed={completed}
          completedForces={completedForces}
          completedTime={completedTime}
          completion={completion}
          noteDrafts={noteDraftsRef}
          noteRevision={noteRevision}
          noteRef={noteRef}
          initialSelectedId={initialStops[0].id}
          selectedIdRef={selectedIdRef}
          selectStopRef={selectStopRef}
          onSelectedStopChange={onSelectedStopChange}
          moveSelected={moveSelected}
          splitPull={splitPull}
          toggleComplete={toggleComplete}
          saveRoute={saveRoute}
          shareRoute={shareRoute}
          updateNote={updateNote}
          focusNote={focusNote}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={undoRoute}
          onRedo={redoRoute}
        />
        </details>
      </div>

      {importOpen ? <dialog open className={styles.importDialog} aria-labelledby="import-title"><div className={styles.importTop}><span><Import aria-hidden="true" /> {copy.importTitle}</span><button type="button" onClick={() => setImportOpen(false)} aria-label={copy.close}><X aria-hidden="true" /></button></div><h2 id="import-title">{copy.importHeading}</h2><p>{copy.importText}</p><textarea value={importValue} onChange={(event) => setImportValue(event.target.value)} placeholder={'{"stops": [...]}'} /><footer className={styles.buttonRow}><button type="button" className={styles.toolButton} onClick={() => setImportOpen(false)}>{copy.cancel}</button><button type="button" className={styles.primaryButton} onClick={importRoute}><Import aria-hidden="true" /> {copy.importAction}</button></footer></dialog> : null}
      <p className={styles.announcement} role="status">{message}</p>
    </main>
    </RouteNamesContext.Provider>
  );
}
