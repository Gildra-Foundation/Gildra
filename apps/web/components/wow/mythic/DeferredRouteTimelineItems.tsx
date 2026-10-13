"use client";

import { memo } from "react";
import { Flame } from "lucide-react";
import { mythicRouteCopy, type RouteLocale } from "./mythicRouteCopy";
import type { RouteStop } from "./rubyLifePoolsData";
import styles from "./mythicRouteMap.module.css";

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

const RouteTimelineItem = memo(function RouteTimelineItem({ stop, index, active, locale, onSelect }: {
  stop: RouteStop;
  index: number;
  active: boolean;
  locale: RouteLocale;
  onSelect: (stopId: number) => void;
}) {
  const copy = mythicRouteCopy[locale];
  return <button type="button" onClick={() => onSelect(stop.id)} aria-pressed={active}><span>{index + 1}{stop.bloodlust ? <Flame aria-hidden="true" /> : null}</span><b>{stop.title}</b><small>{formatTime(stop.duration)}</small><em>{stop.forces ? `${stop.forces.toFixed(1)}%` : stop.kind === "boss" ? copy.bossShort : copy.transitionShort}</em></button>;
});

export function DeferredRouteTimelineItems({ locale, stops, selectedId, onSelect }: {
  locale: RouteLocale;
  stops: RouteStop[];
  selectedId: number;
  onSelect: (stopId: number) => void;
}) {
  return <div className={styles.timelineTrack}>{stops.map((stop, index) => <RouteTimelineItem key={stop.id} stop={stop} index={index} active={selectedId === stop.id} locale={locale} onSelect={onSelect} />)}</div>;
}
