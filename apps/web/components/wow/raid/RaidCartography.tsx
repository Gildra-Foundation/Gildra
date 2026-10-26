"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useMemo, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { ArrowUpRight, Check, Grid2X2, Map, Maximize, Pencil, Route, Skull, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import type { RaidMapImage, RaidMapPin, RaidPullPlan } from "./raidPullTypes";
import type { RaidProgression } from "./raidProgression";
import { raidMapCopy } from "./raidMapCopy";
import { raidBossPlannerCopy } from "./raidBossPlannerCopy";
import { RaidPlannerIcon, RaidPlannerTextMark } from "./VoidspirePlannerArt";
import { readMapPreference, saveMapPreference, sketchPoints, subscribeMapPreferences } from "./raidMapPreferences";
import styles from "./raidMap.module.css";

type CartographyProps = {
  plan: Pick<RaidPullPlan, "slug" | "name" | "encounter">;
  image: RaidMapImage;
  background: "map" | "arena";
  pins: RaidMapPin[];
  bosses: RaidPullPlan["bosses"];
  activeBoss: string;
  links: RaidProgression["links"];
  locale: "ru" | "en";
  onSelectBoss: (slug: string, reveal?: boolean) => void;
  sketchScope?: string;
};

const serverSketch = () => "[]";
const bounded = (value: number) => Math.max(0, Math.min(100, value));
type Cursor = { x: number; y: number };
type AppendPoint = (x: number, y: number) => void;

function drawAtPointer(event: MouseEvent<HTMLButtonElement>, cursor: Cursor, append: AppendPoint) {
  if (event.detail === 0) { append(cursor.x, cursor.y); return; }
  const box = event.currentTarget.getBoundingClientRect();
  append(bounded((event.clientX - box.left) / box.width * 100), bounded((event.clientY - box.top) / box.height * 100));
}

function drawWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, cursor: Cursor, move: AppendPoint, append: AppendPoint, finish: () => void) {
  const step = event.shiftKey ? 1 : 5;
  const directions: Record<string, readonly [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const direction = directions[event.key];
  if (direction) {
    event.preventDefault();
    move(direction[0], direction[1]);
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    append(cursor.x, cursor.y);
  } else if (event.key === "Escape") finish();
}

function CartographyFooter({ background, hasPins, planSlug, activeBoss, locale, count, onUndo, onClear, encounter }: {
  background: "map" | "arena"; hasPins: boolean; planSlug: string; activeBoss: string; locale: "ru" | "en";
  count: number; onUndo: () => void; onClear: () => void; encounter: boolean;
}) {
  const t = raidMapCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  return <div className={styles.mapFooter}><span>{background === "arena" ? encounter ? raidBossPlannerCopy[locale].arenaHint : t.arenaHint : hasPins ? t.approximate : t.emptyFloor}</span>
    {background === "arena" && !encounter && <Link href={`${prefix}/wow/raids/${planSlug}/${activeBoss}`}>{t.tactics}<ArrowUpRight size={14} aria-hidden="true" /></Link>}
    {count > 0 && <div className={styles.sketchTools}><span>{t.own} · {count}</span>
      <AtlasButton className={styles.tool} size="sm" data-raid-tool="undo" aria-label={t.undo} onClick={onUndo}><RaidPlannerTextMark slug={planSlug} text="↶" fallback={<Undo2 size={16} aria-hidden="true" />} /></AtlasButton>
      <AtlasButton className={styles.tool} size="sm" data-raid-tool="clear" aria-label={t.clear} onClick={onClear}><RaidPlannerTextMark slug={planSlug} text="×" fallback={<Trash2 size={16} aria-hidden="true" />} /></AtlasButton>
    </div>}
  </div>;
}

export function RaidCartography({ plan, image, background, pins, bosses, activeBoss, links, locale, onSelectBoss, sketchScope }: CartographyProps) {
  const t = raidMapCopy[locale];
  const helpId = useId();
  const [zoom, setZoom] = useState(1);
  const [showRoute, setShowRoute] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cursor, setCursor] = useState({ x: 50, y: 50 });
  const key = `gildra:raid-sketch:v1:${plan.slug}:${background}:${image.id}${sketchScope ? `:${sketchScope}` : ""}`;
  const storedSketch = useSyncExternalStore(subscribeMapPreferences, () => readMapPreference(key, "[]"), serverSketch);
  const points = useMemo(() => sketchPoints(storedSketch), [storedSketch]);
  const selectedBoss = bosses.find(boss => boss.slug === activeBoss);
  const connections = links.flatMap(link => {
    const a = pins.find(pin => pin.bossSlug === link.from);
    const b = pins.find(pin => pin.bossSlug === link.to);
    return a && b ? [{ a, b, id: `${link.from}-${link.to}` }] : [];
  });

  function append(x: number, y: number) {
    if (points.length >= 40) return;
    saveMapPreference(key, JSON.stringify([...points, { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }]));
  }
  function moveCursor(x: number, y: number) {
    setCursor(point => ({ x: bounded(point.x + x), y: bounded(point.y + y) }));
  }

  return <figure className={styles.figure} data-raid-cartography>
    <figcaption className={styles.caption} data-raid-map-caption><div><span>{background === "arena" ? selectedBoss?.name[locale] : plan.name[locale]}</span><small>{image.name[locale]}</small></div><RaidPlannerIcon slug={plan.slug} kind="map" fallback={<Map size={20} aria-hidden="true" />} /></figcaption>
    <div className={styles.tools} data-raid-map-tools>
      <div><AtlasButton className={styles.tool} size="sm" data-raid-tool="zoom-out" aria-label={t.zoomOut} disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .5))}><RaidPlannerIcon slug={plan.slug} kind="zoom" mark="−" fallback={<ZoomOut size={17} aria-hidden="true" />} /></AtlasButton>
        <AtlasButton className={styles.tool} size="sm" data-raid-tool="fit" onClick={() => setZoom(1)} aria-label={t.fit}><RaidPlannerTextMark slug={plan.slug} text={`${Math.round(zoom * 100)}%`} compact fallback={<><Maximize size={15} aria-hidden="true" /><span>{Math.round(zoom * 100)}%</span></>} /></AtlasButton>
        <AtlasButton className={styles.tool} size="sm" data-raid-tool="zoom-in" aria-label={t.zoomIn} disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + .5))}><RaidPlannerIcon slug={plan.slug} kind="zoom" mark="+" fallback={<ZoomIn size={17} aria-hidden="true" />} /></AtlasButton></div>
      <div><AtlasButton className={styles.tool} size="sm" data-raid-tool="grid" aria-label={t.gridOverlay} aria-pressed={showGrid} onClick={() => setShowGrid(value => !value)}><RaidPlannerIcon slug={plan.slug} kind="grid" fallback={<Grid2X2 size={17} aria-hidden="true" />} /></AtlasButton>
        {background === "map" && <AtlasButton className={styles.tool} size="sm" data-raid-tool="route" aria-pressed={showRoute} onClick={() => setShowRoute(value => !value)}><RaidPlannerIcon slug={plan.slug} kind="map" fallback={<Route size={17} aria-hidden="true" />} /><span>{t.route}</span></AtlasButton>}
        <AtlasButton className={styles.tool} size="sm" data-raid-tool="sketch" aria-pressed={editing} onClick={() => setEditing(value => !value)}><RaidPlannerIcon slug={plan.slug} kind="sketch" mark={editing ? "✓" : undefined} fallback={editing ? <Check size={17} aria-hidden="true" /> : <Pencil size={17} aria-hidden="true" />} /><span>{editing ? t.cancel : t.draw}</span></AtlasButton></div>
    </div>
    <div className={styles.viewport} tabIndex={0} role="group" aria-label={t.pan} data-raid-map-viewport>
      <div className={styles.canvas} style={{ "--map-zoom": zoom, aspectRatio: `${image.width} / ${image.height}` } as CSSProperties} data-raid-map-canvas data-grid={showGrid} data-editing={editing}>
        <Image key={image.src} className={styles.cartography} src={image.src} alt={background === "arena" ? `${t.arena}: ${selectedBoss?.name[locale] ?? ""}` : `${t.map}: ${image.name[locale]}`} width={image.width} height={image.height} sizes="(max-width: 900px) 100vw, 800px" unoptimized draggable={false} data-raid-official-map />
        <div className={styles.gridLayer} aria-hidden="true" />
        <svg className={styles.routeLayer} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {showRoute && connections.map(({ a, b, id }) => <path className={styles.encounterRoute} key={id} d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} />)}
          {points.length > 1 && <polyline className={styles.ownRoute} points={points.map(point => `${point.x},${point.y}`).join(" ")} />}
        </svg>
        {pins.map(pin => {
          const boss = bosses.find(candidate => candidate.slug === pin.bossSlug);
          if (!boss) return null;
          const index = bosses.indexOf(boss);
          return <button type="button" className={styles.bossPin} key={pin.bossSlug} style={{ left: `${pin.x}%`, top: `${pin.y}%` }} data-raid-boss-pin={pin.bossSlug}
            aria-label={`${t.boss} ${index + 1}: ${boss.name[locale]}`} aria-pressed={activeBoss === pin.bossSlug} onClick={() => onSelectBoss(pin.bossSlug, true)} title={boss.name[locale]}>
            {boss.artwork ? <Image src={boss.artwork} alt="" width={40} height={40} unoptimized /> : <Skull size={22} aria-hidden="true" />}<b>{index + 1}</b>
          </button>;
        })}
        {points.map((point, index) => <span key={`${index}-${point.x}-${point.y}`} className={styles.sketchPoint} style={{ left: `${point.x}%`, top: `${point.y}%` }} data-raid-sketch-point aria-hidden="true">{index + 1}</span>)}
        {editing && <button type="button" className={styles.drawCapture} data-raid-sketch-editor aria-label={t.drawing} aria-describedby={helpId}
          onClick={event => drawAtPointer(event, cursor, append)} onKeyDown={event => drawWithKeyboard(event, cursor, moveCursor, append, () => setEditing(false))} />}
        {editing && <span className={styles.drawCursor} style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }} aria-hidden="true" />}
      </div>
    </div>
    <CartographyFooter background={background} hasPins={pins.length > 0} planSlug={plan.slug} activeBoss={activeBoss} locale={locale} count={points.length} encounter={Boolean(plan.encounter)}
      onUndo={() => saveMapPreference(key, JSON.stringify(points.slice(0, -1)))} onClear={() => saveMapPreference(key, "[]")} />
    {editing && <p id={helpId} className={styles.drawHelp}>{t.ownHint} {t.keyboard}</p>}
    <span role="status" className={styles.srOnly}>{editing ? `${t.drawing}. ${t.point}: ${points.length}` : ""}</span>
  </figure>;
}
