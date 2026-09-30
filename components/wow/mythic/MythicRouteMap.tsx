"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type RefObject } from "react";
import {
  Check,
  ChevronDown,
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
import { MythicRouteSelectors } from "./MythicRouteSelectors";
import { dungeonBackdropSource } from "@/lib/wow/dungeonBackdropSource";
import { AbilityIntelCard, EnemyIntelCard } from "./CombatIntelCard";
import type { DungeonRoute, DungeonSelectorOption } from "./dungeonRoutes";
import type { DungeonCombatIntel } from "./dungeonCombatIntel.types";
import { routeAbilityIntel, routeEnemyIntel } from "./routeIntel";
import type { RouteStop } from "./rubyLifePoolsData";
import styles from "./mythicRouteMap.module.css";

const DeferredTestPartyPanel = dynamic(
  () => import("./TestPartyPanel").then((module) => module.TestPartyPanel),
  { ssr: false },
);
const DeferredRouteTimelineItems = dynamic(
  () => import("./DeferredRouteTimelineItems").then((module) => module.DeferredRouteTimelineItems),
  { ssr: false, loading: () => <div aria-hidden="true" style={{ minHeight: 88 }} /> },
);

type Locale = "en" | "ru";
type Role = "tank" | "healer" | "dps";
type SavedRoute = {
  stops: RouteStop[];
  completed: number[];
  notes: Record<number, string>;
  keyLevel: number;
  deaths: number;
};

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

function priorityLabel(priority: RouteStop["enemies"][number]["priority"]) {
  if (priority === "boss") return "Босс";
  if (priority === "high") return "Убить первым";
  if (priority === "medium") return "Опасный";
  return "Обычный враг";
}

function stopKindLabel(kind: RouteStop["kind"]) {
  if (kind === "boss") return "Босс";
  if (kind === "miniboss") return "Сильный враг";
  if (kind === "transition") return "Переход";
  return "Группа врагов";
}

function abilityActionLabel(action: RouteStop["abilities"][number]["action"]) {
  if (action === "Кик") return "Прервать";
  if (action === "Стоп") return "Остановить";
  if (action === "Диспел") return "Снять эффект";
  if (action === "Пурж") return "Снять усиление";
  if (action === "Фокус") return "Убить первым";
  return action;
}

function abilityTargetLabel(target: string) {
  if (target === "ArcanistVexis") return "ArcanistVexis · защита";
  if (target === "MysticHeals") return "MysticHeals · лечение";
  if (target === "ShadowNova") return "ShadowNova · урон";
  if (target === "Windborne") return "Windborne · урон";
  if (target === "Ironclad") return "Ironclad · урон";
  if (target === "Ротация киков") return "Игроки по очереди";
  if (target === "Цель дебаффа") return "Игрок с негативным эффектом";
  if (target === "Мили") return "Игроки рядом с врагом";
  if (target === "Все DPS") return "Все атакующие";
  if (target === "Все кастеры") return "Все, кто произносит заклинание";
  return target;
}

function RouteEditToggle({ pageRef }: { pageRef: { current: HTMLElement | null } }) {
  const [editMode, setEditMode] = useState(false);
  const toggle = () => {
    const next = !editMode;
    pageRef.current?.setAttribute("data-route-edit-mode", String(next));
    setEditMode(next);
  };

  return <button type="button" className={editMode ? styles.controlActive : ""} aria-pressed={editMode} onClick={toggle}>
    <Pencil /> {editMode ? "Готово" : "Редактировать"}
  </button>;
}

function MapZoomControls({ onZoomChange, expanded, onToggleExpanded }: {
  onZoomChange: (zoom: number) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const changeZoom = (nextZoom: number) => {
    const boundedZoom = Math.min(1.5, Math.max(.75, nextZoom));
    setZoom(boundedZoom);
    onZoomChange(boundedZoom);
  };

  return <div className={styles.zoomControls} aria-label="Масштаб карты">
    <button type="button" onClick={() => changeZoom(zoom - .1)} aria-label="Уменьшить"><Minus /></button>
    <output><small>Масштаб</small><b>{Math.round(zoom * 100)}%</b></output>
    <button type="button" onClick={() => changeZoom(zoom + .1)} aria-label="Увеличить"><Plus /></button>
    <button type="button" onClick={() => changeZoom(1)} aria-label="Сбросить масштаб"><RotateCcw /></button>
    <button type="button" className={styles.expandMapButton} onClick={onToggleExpanded} aria-label={expanded ? "Свернуть карту" : "Развернуть карту"} aria-pressed={expanded}>{expanded ? <Minimize2 /> : <Maximize2 />}</button>
  </div>;
}

const RouteStopListItem = memo(function RouteStopListItem({ stop, index, active, complete, canMoveUp, canMoveDown, onSelect, onMoveSelected }: {
  stop: RouteStop;
  index: number;
  active: boolean;
  complete: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSelect: (stopId: number) => void;
  onMoveSelected: ((delta: -1 | 1) => void) | null;
}) {
  return <li>
    <button type="button" onClick={() => onSelect(stop.id)} className={active ? styles.activeStop : ""} aria-pressed={active}>
      <span className={`${stop.kind === "boss" ? styles.bossDot : stop.kind === "miniboss" ? styles.miniBossDot : stop.kind === "transition" ? styles.travelDot : styles.pullDot} ${complete ? styles.completeDot : ""}`}>{complete ? <Check /> : index + 1}</span>
      <span><b>{stop.title}</b><small>{stopKindLabel(stop.kind)} · {plainLanguage(stop.subtitle)}</small><em><Clock3 /> ~{formatTime(stop.duration)} {stop.forces ? `· даст ${stop.forces.toFixed(1)}%` : ""}</em></span>
      {stop.bloodlust ? <Flame className={styles.lustIcon} aria-label="Использовать усиление группы" /> : null}
    </button>
    {onMoveSelected ? <div className={styles.reorderButtons}><button type="button" disabled={!canMoveUp} onClick={() => onMoveSelected(-1)}>↑ Выше</button><button type="button" disabled={!canMoveDown} onClick={() => onMoveSelected(1)}>↓ Ниже</button></div> : null}
  </li>;
});

const RouteMapMarker = memo(function RouteMapMarker({ stop, index, active, complete, onSelect }: {
  stop: RouteStop;
  index: number;
  active: boolean;
  complete: boolean;
  onSelect: (stopId: number) => void;
}) {
  return <button type="button" className={`${styles.marker} ${stop.kind === "boss" ? styles.bossMarker : ""} ${stop.kind === "miniboss" ? styles.miniBossMarker : ""} ${active ? styles.selectedMarker : ""} ${complete ? styles.completedMarker : ""}`} style={{ left: `${stop.x}%`, top: `${stop.y}%` }} onClick={() => onSelect(stop.id)} aria-label={`${index + 1}. ${stop.title}`}>{complete ? <Check /> : index + 1}{stop.bloodlust ? <Flame /> : null}</button>;
});

const RouteNoteField = memo(function RouteNoteField({ initialValue, onChange, noteRef }: {
  initialValue: string;
  onChange: (value: string) => void;
  noteRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [draft, setDraft] = useState(initialValue);
  useEffect(() => setDraft(initialValue), [initialValue]);

  return <label className={styles.note}>
    <span>Заметка группы</span>
    <textarea
      ref={noteRef}
      value={draft}
      onChange={(event) => {
        const value = event.target.value;
        setDraft(value);
        onChange(value);
      }}
      placeholder="Кто кикает, где ставим метку, когда нажимаем защиту…"
    />
  </label>;
});

function MapSelectionLabel({ stops, selectedId }: { stops: RouteStop[]; selectedId: number }) {
  return <>Текущая цель: {stops.findIndex((stop) => stop.id === selectedId) + 1} из {stops.length}</>;
}

const RouteStepNarrative = memo(function RouteStepNarrative({ dungeon, selected, role, combatIntel, onRoleChange }: {
  dungeon: DungeonRoute;
  selected: RouteStop;
  role: Role;
  combatIntel: DungeonCombatIntel;
  onRoleChange: (role: Role) => void;
}) {
  return <>
    <p className={styles.detailDescription}>{plainLanguage(selected.summary)}</p>
    <section className={styles.enemySection}><h3>Кого победить <b>{selected.enemies.reduce((total, enemy) => total + enemy.count, 0)} врагов</b></h3>{selected.enemies.length ? <ul>{selected.enemies.map((enemy) => { const data = combatIntel.enemies[enemy.name]; const intel = dungeon.slug === "ruby-life-pools" ? data?.intel : routeEnemyIntel(enemy, selected, dungeon.nameRu); return <EnemyIntelCard key={enemy.name} dungeonName={dungeon.nameRu} encounter={selected.title} name={enemy.name} count={enemy.count} priority={enemy.priority} priorityLabel={priorityLabel(enemy.priority)} summary={intel?.summary} danger={intel?.danger} media={data?.media} icon={<span className={`${styles.enemyPriority} ${styles[enemy.priority]}`}>{enemy.name.slice(0, 1)}</span>} />; })}</ul> : <p>Здесь боя не будет.</p>}</section>
    <section className={styles.abilitySection}><h3>На что реагировать</h3>{selected.abilities.length ? <ul>{selected.abilities.map((ability) => { const data = combatIntel.abilities[ability.name]; const intel = dungeon.slug === "ruby-life-pools" ? data?.intel : routeAbilityIntel(ability, selected); return <AbilityIntelCard key={ability.name} name={ability.name} action={abilityActionLabel(ability.action)} responsible={abilityTargetLabel(ability.target)} source={ability.source ?? data?.source} encounter={selected.title} effect={intel?.effect} failure={intel?.failure} media={data?.media} icon={<span className={styles.abilityIcon}>{ability.name.slice(0, 1)}</span>} />; })}</ul> : <p>На этом участке нет опасных способностей.</p>}</section>
    <h3>Главное в этом шаге</h3>
    <ul className={styles.callouts}>{selected.callouts.map((callout) => <li key={callout}>{plainLanguage(callout)}</li>)}</ul>
    <div className={styles.roleTabs} aria-label="Что важно каждой роли">{(["tank", "healer", "dps"] as Role[]).map((item) => <button key={item} type="button" onClick={() => onRoleChange(item)} className={role === item ? styles.activeRole : ""}>{item === "tank" ? "Защита" : item === "healer" ? "Лечение" : "Урон"}</button>)}</div>
    <p className={styles.roleText}>{plainLanguage(selected[role])}</p>
  </>;
});

const RouteDetails = memo(function RouteDetails({ dungeon, selected, selectedIndex, totalSteps, isComplete, role, note, noteRef, noteRevision, combatIntel, onRoleChange, onNoteChange, onFocusNote, onSplitPull, onToggleComplete, onSaveRoute, onShareRoute }: {
  dungeon: DungeonRoute;
  selected: RouteStop;
  selectedIndex: number;
  totalSteps: number;
  isComplete: boolean;
  role: Role;
  note: string;
  noteRef: RefObject<HTMLTextAreaElement | null>;
  noteRevision: number;
  combatIntel: DungeonCombatIntel;
  onRoleChange: (role: Role) => void;
  onNoteChange: (value: string) => void;
  onFocusNote: () => void;
  onSplitPull: () => void;
  onToggleComplete: () => void;
  onSaveRoute: () => void;
  onShareRoute: () => void;
}) {
  return <aside className={styles.details} aria-live="polite">
    <div className={styles.detailTop}><p>Сейчас · шаг {selectedIndex + 1} из {totalSteps}</p><span className={selected.kind === "boss" ? styles.bossTag : selected.kind === "miniboss" ? styles.miniBossTag : styles.pullTag}>{stopKindLabel(selected.kind)}</span></div>
    <div key={selected.id} className={styles.detailHeading}><div className={styles.detailNumber}>{selectedIndex + 1}</div><div><h2>{selected.title}</h2><p>~{formatTime(selected.duration)} · даст {selected.forces.toFixed(1)}% · после шага будет {selected.cumulative.toFixed(1)}%</p></div></div>
    <RouteStepNarrative dungeon={dungeon} selected={selected} role={role} combatIntel={combatIntel} onRoleChange={onRoleChange} />
    <div className={styles.detailActions}><button type="button" onClick={onSplitPull}><Scissors /> Разделить врагов</button><button type="button" onClick={onFocusNote}><Pencil /> Добавить заметку</button></div>
    <button type="button" className={styles.doneButton} onClick={onToggleComplete}>{isComplete ? <Undo2 /> : <Check />}{isComplete ? "Вернуть шаг в план" : "Отметить шаг выполненным"}</button>
    <RouteNoteField key={`${selected.id}-${noteRevision}`} initialValue={note} onChange={onNoteChange} noteRef={noteRef} />
    <div className={styles.actions}><button type="button" onClick={onSaveRoute}><Save /> Сохранить</button><button type="button" onClick={onShareRoute}><Copy /> Ссылка</button></div>
    <div className={styles.resourceLinks}><a href={dungeon.mdtRouteUrl} target="_blank" rel="noreferrer">Маршруты сообщества <ExternalLink /></a><a href={dungeon.guideUrl} target="_blank" rel="noreferrer">Подробный разбор <ExternalLink /></a></div>
  </aside>;
});

function RouteInteractionLayer({
  locale,
  dungeon,
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
  locale: Locale;
  dungeon: DungeonRoute;
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
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [floor, setFloor] = useState(dungeon.floors[0].id);
  const [role, setRole] = useState<Role>("tank");
  const [mapExpanded, setMapExpanded] = useState(false);
  const [partyPanelMounted, setPartyPanelMounted] = useState(false);
  const [routeTimelineReady, setRouteTimelineReady] = useState(false);
  const mapCanvasRef = useRef<HTMLDivElement>(null);
  const routeTimelineRef = useRef<HTMLElement>(null);
  const [, startTransition] = useTransition();
  const updateMapZoom = useCallback((zoom: number) => {
    if (mapCanvasRef.current) mapCanvasRef.current.style.transform = `scale(${zoom})`;
  }, []);
  const stopIndexById = useMemo(() => new Map(stops.map((stop, index) => [stop.id, index])), [stops]);
  const completedStopIds = useMemo(() => new Set(completed), [completed]);
  const selected = stops.find((stop) => stop.id === selectedId) ?? stops[0];
  const filteredStops = useMemo(() => stops.filter((stop) => stop.floor === floor), [floor, stops]);
  const updateSelectedNote = useCallback((value: string) => updateNote(selected.id, value), [selected.id, updateNote]);
  const selectStop = useCallback((id: number) => {
    const nextStop = stops.find((stop) => stop.id === id);
    onSelectedStopChange(id);
    setSelectedId(id);
    if (nextStop && nextStop.floor !== floor) setFloor(nextStop.floor);
  }, [floor, onSelectedStopChange, stops]);
  selectStopRef.current = selectStop;

  useEffect(() => {
    const requestedId = selectedIdRef.current;
    if (requestedId !== selectedId) setSelectedId(requestedId);
    const requestedStop = stops.find((stop) => stop.id === requestedId);
    if (requestedStop && requestedStop.floor !== floor) setFloor(requestedStop.floor);
  }, [floor, selectedId, selectedIdRef, stops]);

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

  const workspace = useMemo(() => (
    <section className={styles.workspace} aria-label={`${dungeon.name} route planner`} data-reveal>
      <aside className={styles.stops}>
        <header><span>Что делать по порядку</span><b>{completed.length}/{stops.length}</b></header>
        <ol>
          {stops.map((stop, index) => <RouteStopListItem
            key={stop.id}
            stop={stop}
            index={index}
            active={selectedId === stop.id}
            complete={completedStopIds.has(stop.id)}
            canMoveUp={index > 0}
            canMoveDown={index < stops.length - 1}
            onSelect={selectStop}
            onMoveSelected={moveSelected}
          />)}
        </ol>
        <div className={styles.progress}><span>Маршрут выполнен</span><b>{completion}%</b><i><em style={{ width: `${completion}%` }} /></i></div>
        <div className={styles.sourceNote}>Потрачено <CompletedTimeValue /> · побеждено {completedForces.toFixed(1)}% врагов</div>
      </aside>

      <div className={`${styles.mapPanel} ${mapExpanded ? styles.mapPanelExpanded : ""}`}>
        <div className={styles.mapHeader}>
          <div className={styles.mapIdentity}>
            <span><LocateFixed /> <b>Карта подземелья</b></span>
            <small><i /> {dungeon.nameRu} <em aria-hidden="true">·</em> выбранный шаг отмечен на карте</small>
          </div>
          <div className={styles.mapCommandDeck}>
            <div className={styles.floorTabs} aria-label="Этаж карты">
              <span aria-hidden="true">Этаж</span>
              {dungeon.floors.map((item) => <button key={item.id} type="button" className={floor === item.id ? styles.activeFloor : ""} onClick={() => setFloor(item.id)} aria-label={`${item.id}F`} aria-pressed={floor === item.id}><b>{item.id}F</b><small>{item.label}</small></button>)}
            </div>
            <MapZoomControls
              onZoomChange={updateMapZoom}
              expanded={mapExpanded}
              onToggleExpanded={() => setMapExpanded((value) => !value)}
            />
          </div>
        </div>
        <div className={styles.mapViewport}>
          <div className={styles.mapRuler} aria-hidden="true"><span>КАРТА ПОДЗЕМЕЛЬЯ</span><i /><span>СЕЗОН MIDNIGHT</span></div>
          <div className={styles.mapTelemetry} aria-hidden="true"><span><i /> Маршрут готов</span><span><Swords /> Силы противника: {completedForces.toFixed(1)} из 100%</span><span><MapPinned /> <MapSelectionLabel stops={stops} selectedId={selectedId} /></span></div>
          <div className={styles.mapCoordinates} aria-hidden="true"><b>С</b><span>48° 31&apos; 12&quot;</span><i /><span>СХЕМА МАРШРУТА</span></div>
          <div className={styles.mapCrosshair} aria-hidden="true"><i /><i /></div>
          <div className={styles.mapCanvas} ref={mapCanvasRef} style={{ transform: "scale(1)" }}>
            <Image key={dungeon.mapImage} src={dungeon.mapImage} width={1002} height={668} sizes="(max-width: 780px) calc(100vw - 64px), (max-width: 1320px) calc(100vw - 400px), (max-width: 1529px) calc(100vw - 770px), 760px" alt={`Карта ${dungeon.name}, этаж ${floor}`} />
            <span className={styles.mapVignette} aria-hidden="true" />
            <span className={styles.mapCorners} aria-hidden="true"><i /><i /><i /><i /></span>
            <svg className={styles.routeLine} data-testid="route-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline className={styles.routeGlow} points={filteredStops.map((stop) => `${stop.x},${stop.y}`).join(" ")} /><polyline className={styles.routePath} points={filteredStops.map((stop) => `${stop.x},${stop.y}`).join(" ")} /></svg>
            {filteredStops.map((stop) => <RouteMapMarker
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
          <div className={styles.mapLegend}><span><i className={styles.pullDot} /> Группа врагов</span><span><i className={styles.miniBossDot} /> Сильный враг</span><span><i className={styles.bossDot} /> Босс</span></div>
          <div className={styles.mapFooterProgress} aria-label={`Маршрут выполнен на ${completion}%`}><span><b>{completion}%</b> пройдено</span><i><em style={{ width: `${completion}%` }} /></i></div>
          <a href={dungeon.guideUrl} target="_blank" rel="noreferrer">Подробный разбор <ExternalLink /></a>
        </footer>
      </div>

      <RouteDetails dungeon={dungeon} selected={selected} selectedIndex={stopIndexById.get(selected.id) ?? 0} totalSteps={stops.length} isComplete={completedStopIds.has(selected.id)} role={role} note={noteDrafts.current[selected.id] ?? ""} noteRef={noteRef} noteRevision={noteRevision} combatIntel={combatIntel} onRoleChange={setRole} onNoteChange={updateSelectedNote} onFocusNote={focusNote} onSplitPull={splitPull} onToggleComplete={toggleComplete} onSaveRoute={saveRoute} onShareRoute={shareRoute} />
    </section>
  ), [
    completed, completedForces, completion, dungeon, filteredStops, floor,
    focusNote, mapExpanded, moveSelected, noteDrafts, noteRef, noteRevision, role, saveRoute, selectedId, selectStop,
    stopIndexById, completedStopIds, updateSelectedNote,
    setFloor, setMapExpanded, setRole, shareRoute,
    splitPull, stops, toggleComplete, updateNote, updateMapZoom,
  ]);

  return <CompletedTimeContext.Provider value={completedTime}>
    {workspace}
    <section ref={routeTimelineRef} className={styles.routeTimeline} aria-label="Весь план по шагам" data-reveal>
      <header><div><MapPinned /> <span>Весь план по шагам</span></div><div><button type="button" onClick={onUndo} disabled={!canUndo}><Undo2 /> Отменить</button><button type="button" onClick={onRedo} disabled={!canRedo}><Redo2 /> Повторить</button></div></header>
      {routeTimelineReady ? <DeferredRouteTimelineItems stops={stops} selectedId={selectedId} onSelect={selectStop} /> : <div aria-hidden="true" style={{ minHeight: 88 }} />}
    </section>
    <div className={partyPanelMounted ? undefined : styles.partyPanelPlaceholder} aria-busy={!partyPanelMounted || undefined}>
      {partyPanelMounted
        ? <DeferredTestPartyPanel locale={locale} routeStops={stops} selectedStop={selected} onSelectStop={selectStop} />
        : <button type="button" onClick={mountPartyPanel}>Открыть состав группы и тактические назначения</button>}
    </div>
  </CompletedTimeContext.Provider>;
}

function plainLanguage(text: string) {
  return text
    .replaceAll("Стакайте пак", "Соберите врагов вместе")
    .replaceAll("Стак у стены", "Соберитесь у стены")
    .replaceAll("треш", "обычные группы врагов")
    .replaceAll("пулл", "группу врагов")
    .replaceAll("мобов", "врагов")
    .replaceAll("паков", "групп врагов")
    .replaceAll("паком", "группой врагов")
    .replaceAll("пак", "группу врагов")
    .replaceAll("Bloodlust", "усиление всей группы")
    .replaceAll("bloodlust", "усиление всей группы")
    .replaceAll("нужен hard CC", "нужно сильное оглушение")
    .replaceAll("Hard CC", "Сильное оглушение")
    .replaceAll("hard CC", "сильное оглушение")
    .replaceAll("cooldowns", "сильные способности")
    .replaceAll("burst", "сильный урон")
    .replaceAll("mitigation", "защиту")
    .replaceAll("Mitigation", "Используйте защиту")
    .replaceAll("Групповой CD", "Сильную защиту группы")
    .replaceAll("танковый CD", "защиту танка")
    .replaceAll("CD", "защитное умение")
    .replaceAll("АоЕ", "массовое")
    .replaceAll("касты", "заклинания")
    .replaceAll("кастеры", "игроки, произносящие заклинания")
    .replaceAll("кикается", "нужно прервать")
    .replaceAll("кикнуть", "прервать")
    .replaceAll("киков", "прерываний")
    .replaceAll("Кикайте", "Прерывайте")
    .replaceAll("кикайте", "прерывайте")
    .replaceAll("Кики", "Прерывания")
    .replaceAll("кики", "прерывания")
    .replaceAll("Первый кик", "Первое прерывание")
    .replaceAll("главный кик", "главное прерывание")
    .replaceAll(" — кик ", " — прервать ")
    .replaceAll("диспелим", "снимаем")
    .replaceAll("диспелить", "снять")
    .replaceAll("двойной диспел", "одновременное снятие двух эффектов")
    .replaceAll("Пуржите", "Снимите усиление")
    .replaceAll("Пурж", "Снять усиление")
    .replaceAll("purge", "снимите усиление")
    .replaceAll("мили", "бойцы рядом с врагом")
    .replaceAll("ranged", "бойцы вдали")
    .replaceAll("melee", "ближней зоне")
    .replaceAll("адда", "дополнительного врага")
    .replaceAll("whelps", "маленьких драконов")
    .replaceAll("DoT", "периодического урона")
    .replaceAll("cleave", "урона по нескольким целям")
    .replaceAll("стаков", "уровней эффекта")
    .replaceAll("стаками", "уровнями эффекта")
    .replaceAll("дебафф", "негативный эффект")
    .replaceAll("прожимайтесь", "используйте защиту");
}

export function MythicRouteMap({ locale, dungeon, dungeonOptions, combatIntel }: { locale: Locale; dungeon: DungeonRoute; dungeonOptions: DungeonSelectorOption[]; combatIntel: DungeonCombatIntel }) {
  const initialStops = dungeon.stops;
  const storageKey = `gildra:mythic:${dungeon.slug}:v3`;
  const timerSeconds = dungeon.timerSeconds;
  const localePrefix = locale === "ru" ? "/ru" : "";
  const [stops, setStops] = useState<RouteStop[]>(initialStops);
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
  const backdropRef = useRef<HTMLDivElement>(null);
  const parallaxFrame = useRef<number | null>(null);
  const messageTimer = useRef<number | null>(null);
  const selectedIdRef = useRef(initialStops[0].id);
  const selectStopRef = useRef<(id: number) => void>(() => {});
  const routeSnapshot = useRef({ stops, completed, notes: noteDraftsRef.current, keyLevel, deaths, selectedId: selectedIdRef.current });
  routeSnapshot.current = { stops, completed, notes: noteDraftsRef.current, keyLevel, deaths, selectedId: selectedIdRef.current };
  const onSelectedStopChange = useCallback((id: number) => {
    selectedIdRef.current = id;
    routeSnapshot.current.selectedId = id;
  }, []);

  const totalDuration = useMemo(() => stops.reduce((total, stop) => total + stop.duration, 0) + deaths * 15, [deaths, stops]);
  const completedForces = useMemo(() => stops.filter((stop) => completed.includes(stop.id)).reduce((total, stop) => total + stop.forces, 0), [completed, stops]);
  const completedTime = useMemo(() => stops.filter((stop) => completed.includes(stop.id)).reduce((total, stop) => total + stop.duration, 0) + deaths * 15, [completed, deaths, stops]);
  const completion = Math.round((completed.length / stops.length) * 100);
  const reserveSeconds = Math.max(0, timerSeconds - totalDuration);
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
  }, []);

  useEffect(() => () => {
    if (parallaxFrame.current !== null) window.cancelAnimationFrame(parallaxFrame.current);
    if (messageTimer.current !== null) window.clearTimeout(messageTimer.current);
  }, []);

  useEffect(() => {
    pageRef.current?.setAttribute("data-interactive", "true");
  }, []);

  useEffect(() => {
    const target = pageRef.current;
    const backdrop = backdropRef.current;
    // The parallax follows a mouse; don't attach a scroll/timer loop to touch-only devices.
    if (!target || !backdrop
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches
      || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let latestPointer: { clientX: number; clientY: number } | null = null;
    let lastUpdate = performance.now() - 50;
    let scrollIdleTimer: number | null = null;
    let scrolling = false;
    const reset = () => {
      latestPointer = null;
      if (parallaxFrame.current !== null) {
        window.cancelAnimationFrame(parallaxFrame.current);
        parallaxFrame.current = null;
      }
      backdrop.style.removeProperty("transform");
    };
    const pauseDuringScroll = () => {
      if (!scrolling) {
        scrolling = true;
        latestPointer = null;
        if (parallaxFrame.current !== null) {
          window.cancelAnimationFrame(parallaxFrame.current);
          parallaxFrame.current = null;
        }
        backdrop.style.transform = "scale(1.035)";
      }
      if (scrollIdleTimer !== null) window.clearTimeout(scrollIdleTimer);
      scrollIdleTimer = window.setTimeout(() => {
        scrolling = false;
        scrollIdleTimer = null;
      }, 180);
    };
    const move = (event: PointerEvent) => {
      if (scrolling || event.pointerType === "touch") return;
      latestPointer = { clientX: event.clientX, clientY: event.clientY };
      if (parallaxFrame.current !== null) return;
      parallaxFrame.current = window.requestAnimationFrame(() => {
        parallaxFrame.current = null;
        if (!latestPointer) return;

        const now = performance.now();
        if (now - lastUpdate < 50) return;
        lastUpdate = now;

        const bounds = target.getBoundingClientRect();
        const x = (latestPointer.clientX - bounds.left) / bounds.width - .5;
        const y = (latestPointer.clientY - bounds.top) / Math.max(window.innerHeight, bounds.height * .35) - .35;
        backdrop.style.transform = `translate3d(${Math.round(x * -18)}px, ${Math.round(y * -12)}px, 0) scale(1.035)`;
      });
    };

    target.addEventListener("pointermove", move, { passive: true });
    target.addEventListener("pointerleave", reset, { passive: true });
    window.addEventListener("scroll", pauseDuringScroll, { capture: true, passive: true });
    return () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerleave", reset);
      window.removeEventListener("scroll", pauseDuringScroll, true);
      if (scrollIdleTimer !== null) window.clearTimeout(scrollIdleTimer);
      reset();
    };
  }, []);

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
    announce("Маршрут и прогресс сохранены");
  }, [announce, storageKey]);

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
    window.localStorage.removeItem(storageKey);
    announce("Маршрут сброшен");
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
    announce("Последнее изменение отменено");
  }

  function redoRoute() {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((history) => [...history, stops]);
    setRedoStack((history) => history.slice(0, -1));
    setStops(next);
    announce("Изменение возвращено");
  }

  const splitPull = useCallback(() => {
    const { stops, selectedId } = routeSnapshot.current;
    const selected = stops.find((stop) => stop.id === selectedId) ?? stops[0];
    const selectedIndex = stops.findIndex((stop) => stop.id === selected.id);
    if (selected.kind !== "pull" || selected.forces <= 0) {
      announce("Разделить можно только группу врагов");
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
    announce("Группа врагов разделена на две части");
  }, [announce, commitStops]);

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
      await navigator.clipboard.writeText(url.toString());
      announce("Ссылка на выбранный шаг скопирована");
    } catch {
      window.prompt("Скопируйте ссылку", url.toString());
    }
  }, [announce]);

  const updateNote = useCallback((stopId: number, value: string) => {
    noteDraftsRef.current[stopId] = value;
  }, []);
  const focusNote = useCallback(() => noteRef.current?.focus(), []);

  function exportRoute() {
    const payload = JSON.stringify({ dungeon: dungeon.name, dungeonSlug: dungeon.slug, keyLevel, stops, notes: noteDraftsRef.current }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `gildra-${dungeon.slug}-route.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMoreOpen(false);
    announce("JSON маршрута скачан");
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
      announce("Маршрут импортирован");
    } catch {
      announce("Не удалось прочитать JSON маршрута");
    }
  }



  return (
    <main
      ref={pageRef}
      className={styles.page}
      data-dungeon={dungeon.slug}
      data-route-lazy-disabled
      style={{ "--dungeon-accent": dungeon.accent, "--dungeon-map": `url("${dungeon.mapImage}")`, "--dungeon-backdrop": `url("${dungeonBackdropSource(dungeon)}")` } as CSSProperties}
    >
      <div className={styles.ambient} aria-hidden="true"><i /><i /><i /></div>
      <div ref={backdropRef} className={styles.dungeonBackdrop} data-testid="dungeon-backdrop" aria-hidden="true"><i /><i /><i /><span /><span /></div>
      <header className={styles.topbar}>
        <a className={styles.brand} href={`${localePrefix}/wow`}><i aria-hidden="true">W</i><span>GILDRA</span></a>
        <a className={styles.back} href={`${localePrefix}/wow/mythic-plus`}>{locale === "ru" ? "Все подземелья" : "All dungeons"}</a>
        <span className={styles.separator} aria-hidden="true" />
        <span className={styles.section}><Swords aria-hidden="true" /> Mythic+</span>
        <span className={styles.season}><i /> Midnight · Сезон 2</span>
      </header>

      <section className={styles.intro}>
        <div className={styles.dungeonCrest} aria-hidden="true"><i /><i /><span><Flame /></span><b>{initialStops.length}</b></div>
        <div className={styles.introIdentity}>
          <p>Путеводитель по подземелью · {dungeon.location} · Обновление 12.1</p>
          <div className={styles.titleRow}><div><h1>{dungeon.nameRu}</h1><span className={styles.dungeonSubtitle}>{dungeon.name}</span></div><span className={styles.tag}>+{keyLevel}</span></div>
          <p className={styles.description}><strong>Цель:</strong> {dungeon.description}</p>
          <div className={styles.heroMeta}><span><MapPinned /> {stops.length} шагов</span><span><Clock3 /> Займёт ~{formatTime(totalDuration)}</span><span><Check /> Запас {formatTime(reserveSeconds)}</span></div>
        </div>
        <div className={styles.routeControls}>
          <MythicRouteSelectors locale={locale} dungeonSlug={dungeon.slug} dungeonOptions={dungeonOptions} keyLevel={keyLevel} onKeyLevelChange={setKeyLevel} />
          <RouteEditToggle pageRef={pageRef} />
          <button type="button" onClick={shareRoute}><Share2 /> Поделиться</button>
          <button type="button" onClick={() => setImportOpen(true)}><Import /> Импорт</button>
          <div className={styles.moreMenu}>
            <button type="button" aria-label="Дополнительные действия" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}><MoreHorizontal /></button>
            {moreOpen ? <div><button type="button" onClick={exportRoute}><Download /> Скачать JSON</button><button type="button" onClick={resetRoute}><RotateCcw /> Сбросить маршрут</button></div> : null}
          </div>
        </div>
      </section>

      <aside role="note" style={{ margin: "0 auto 24px", width: "min(1180px, calc(100% - 32px))", padding: "16px", border: "1px solid #b78342", background: "rgba(35, 24, 13, .92)" }}>
        <strong>{locale === "ru" ? "Статус: тактический черновик, не проверен для игры." : "Status: tactical draft, not game-verified."}</strong>
        <p>{locale === "ru"
          ? "Официальным источником подтверждён только состав пула Midnight Season 2. Маршрут, проценты сил, таймеры, назначения и текст механик скрыты от индексации и не считаются достоверными до сверки spell/NPC ID и источников."
          : "Only the Midnight Season 2 pool membership is confirmed by an official source. Route, forces, timers, assignments, and mechanic copy are noindexed and are not treated as authoritative until spell/NPC IDs and sources are reconciled."}</p>
        <a href="https://worldofwarcraft.blizzard.com/en-us/news/24280285" rel="noreferrer">Blizzard · Midnight Season 2</a>
      </aside>

      <section className={styles.runSummary} aria-label="Сводка прохождения">
        <article><span><Clock3 /> Нужно уложиться</span><b>{formatTime(timerSeconds)}</b><small className={totalDuration <= timerSeconds ? styles.positive : styles.negative}>План: {formatTime(totalDuration)} · запас {formatTime(reserveSeconds)}</small></article>
        <article><span><Swords /> Врагов побеждено</span><b>{completedForces.toFixed(1)}%</b><small>Нужно: 100%</small></article>
        <article><span><Skull /> Смерти группы</span><div className={styles.deathControl}><button type="button" onClick={() => setDeaths((value) => Math.max(0, value - 1))} aria-label="Убрать смерть"><Minus /></button><b>{deaths}</b><button type="button" onClick={() => setDeaths((value) => value + 1)} aria-label="Добавить смерть"><Plus /></button></div><small>Каждая добавляет 15 секунд</small></article>
        <article><span><ShieldAlert /> Особые условия</span><div className={styles.affixes}><button type="button" title="Обычные враги сильнее" onClick={() => announce("Обычные враги сильнее и опаснее")}>Враги сильнее</button><button type="button" title="Условия текущего сезона" onClick={() => announce("Действуют условия Midnight Season 2")}>Сезон 2</button></div><small>Условия этого забега</small></article>
        <article><span><Users /> Команда собрана</span><b>5 / 5</b><small>Защита · лечение · урон</small></article>
      </section>

      <CompletedTimeContext.Provider value={completedTime}>
        <RouteInteractionLayer
          locale={locale}
          dungeon={dungeon}
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
      </CompletedTimeContext.Provider>

      {importOpen ? <dialog open className={styles.importDialog} aria-labelledby="import-title"><div><span><Import /> Импорт маршрута</span><button type="button" onClick={() => setImportOpen(false)} aria-label="Закрыть"><X /></button></div><h2 id="import-title">Вставьте JSON маршрута Gildra</h2><p>Можно вставить массив действий или ранее скачанный файл целиком.</p><textarea value={importValue} onChange={(event) => setImportValue(event.target.value)} placeholder={'{"stops": [...]}'}/><footer><button type="button" onClick={() => setImportOpen(false)}>Отмена</button><button type="button" onClick={importRoute}><Import /> Импортировать</button></footer></dialog> : null}
      <p className={styles.announcement} role="status">{message}</p>
    </main>
  );
}
