"use client";

import { memo } from "react";
import { Flame } from "lucide-react";
import type { RouteStop } from "./rubyLifePoolsData";
import styles from "./mythicRouteMap.module.css";

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

const RouteTimelineItem = memo(function RouteTimelineItem({ stop, index, active, onSelect }: {
  stop: RouteStop;
  index: number;
  active: boolean;
  onSelect: (stopId: number) => void;
}) {
  return <button type="button" onClick={() => onSelect(stop.id)} className={active ? styles.timelineActive : ""}><span>{index + 1}{stop.bloodlust ? <Flame /> : null}</span><b>{stop.title}</b><small>{formatTime(stop.duration)}</small><em>{stop.forces ? `${stop.forces.toFixed(1)}%` : stop.kind === "boss" ? "Босс" : "Переход"}</em></button>;
});

export function DeferredRouteTimelineItems({ stops, selectedId, onSelect }: {
  stops: RouteStop[];
  selectedId: number;
  onSelect: (stopId: number) => void;
}) {
  return <div>{stops.map((stop, index) => <RouteTimelineItem key={stop.id} stop={stop} index={index} active={selectedId === stop.id} onSelect={onSelect} />)}</div>;
}
