"use client";

import { memo, useMemo, useState } from "react";
import { MoveHorizontal, MousePointer2 } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { RotationAbility, RotationSimulationResult } from "@/lib/platform/rotation/types";
import { AbilityIcon } from "./AbilityIcon";
import styles from "./rotationLab.module.css";
import deferredLabStyles from "./rotationLabDeferred.module.css";

const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const position = (time: number, length: number) => `${Math.min(100, Math.max(0, (time / length) * 100))}%`;

const TimelineTracks = memo(function TimelineTracks({ result, abilities, lang, onCursor }: {
  result: RotationSimulationResult;
  abilities: RotationAbility[];
  lang: Lang;
  onCursor: (time: number) => void;
}) {
  const tr = t(lang);
  const byId = useMemo(() => new Map(abilities.map((ability) => [ability.id, ability])), [abilities]);
  const globalCasts = useMemo(() => result.casts.filter((cast) => cast.lane === "global"), [result.casts]);
  const majorCasts = useMemo(() => result.casts.filter((cast) => cast.lane === "major"), [result.casts]);
  const procCasts = useMemo(() => result.casts.filter((cast) => cast.lane === "proc"), [result.casts]);
  const ragePoints = useMemo(() => result.rage.map((point) => `${(point.time / result.fightLengthSeconds) * 1000},${116 - point.value}`).join(" "), [result.rage, result.fightLengthSeconds]);
  const rageFill = `0,116 ${ragePoints} 1000,116`;
  const resourceLabel = result.resourceLabel ?? (lang === "ru" ? "Ресурс" : "Resource");

  return <>
    <div className={`${styles.timelineLane} ${styles.castLane}`}><b>{tr("Global Cooldowns")}</b><div>{globalCasts.map((cast) => { const ability = byId.get(cast.abilityId); return ability ? <button key={cast.id} style={{ left: position(cast.time, result.fightLengthSeconds) }} onClick={() => onCursor(cast.time)} aria-label={`${ability.name} ${stamp(cast.time)}`} title={`${ability.name} · ${stamp(cast.time)}`}><AbilityIcon ability={ability} size="sm" /></button> : null; })}</div></div>
    <div className={`${styles.timelineLane} ${styles.majorLane}`}><b>{tr("Major Cooldowns")}</b><div>{majorCasts.map((cast) => { const ability = byId.get(cast.abilityId); return ability ? <button key={cast.id} style={{ left: position(cast.time, result.fightLengthSeconds), width: `${((cast.duration ?? 5) / result.fightLengthSeconds) * 100}%` }} onClick={() => onCursor(cast.time)}><AbilityIcon ability={ability} size="sm" /><span>{ability.name}<small>{cast.duration} {lang === "ru" ? "с" : "s"}</small></span></button> : null; })}</div></div>
    <div className={`${styles.timelineLane} ${styles.procLane}`}><b>{tr("Procs")}</b><div>{result.procs?.length ? result.procs.map((proc) => <button key={proc.id} className={deferredLabStyles.procWindow} style={{ left: position(proc.time, result.fightLengthSeconds), width: `${Math.max(.8, (proc.duration / result.fightLengthSeconds) * 100)}%` }} onClick={() => onCursor(proc.time)} aria-label={`${proc.name} ${stamp(proc.time)}`} title={`${proc.name} · ${proc.duration} ${lang === "ru" ? "с" : "s"}`}><span>{proc.name}</span></button>) : procCasts.map((cast) => { const ability = byId.get(cast.abilityId); return ability ? <button key={cast.id} style={{ left: position(cast.time, result.fightLengthSeconds) }} onClick={() => onCursor(cast.time)} aria-label={`${ability.name} · ${tr("Proc")} ${stamp(cast.time)}`} title={`${ability.name} · ${tr("Proc")} · ${stamp(cast.time)}`}><AbilityIcon ability={ability} size="sm" /></button> : null; })}</div></div>
    <div className={`${styles.timelineLane} ${styles.rageLane}`}><b>{resourceLabel} <small>100<br />50<br />0</small></b><div><svg viewBox="0 0 1000 120" preserveAspectRatio="none" role="img" aria-label={`${resourceLabel}: ${tr("Resource over time")}`}><defs><linearGradient id="resource-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--rotation-hot)" stopOpacity=".62" /><stop offset="1" stopColor="var(--rotation-accent)" stopOpacity=".08" /></linearGradient></defs><line x1="0" x2="1000" y1="16" y2="16" /><line x1="0" x2="1000" y1="66" y2="66" /><line x1="0" x2="1000" y1="116" y2="116" /><polygon points={rageFill} fill="url(#resource-fill)" /><polyline points={ragePoints} /></svg></div></div>
    <div className={`${styles.timelineLane} ${styles.uptimeLane}`}><b>{tr("Priority Uptime")}</b><div><span style={{ width: `${result.enrageUptime}%` }}>{result.enrageUptime}%</span></div></div>
  </>;
});

export default function RotationTimeline({ result, abilities, lang, cursor, onCursor }: {
  result: RotationSimulationResult;
  abilities: RotationAbility[];
  lang: Lang;
  cursor: number;
  onCursor: (time: number) => void;
}) {
  const tr = t(lang);
  const [zoom, setZoom] = useState<"fit" | "60" | "30">("fit");
  const byId = useMemo(() => new Map(abilities.map((ability) => [ability.id, ability])), [abilities]);
  const ticks = Array.from({ length: 9 }, (_, index) => Math.round((result.fightLengthSeconds / 8) * index));
  const canvasWidth = zoom === "fit" ? "100%" : zoom === "60" ? `${Math.max(100, (result.fightLengthSeconds / 60) * 100)}%` : `${Math.max(100, (result.fightLengthSeconds / 30) * 100)}%`;
  const sortedCasts = useMemo(() => [...result.casts].sort((a, b) => a.time - b.time), [result.casts]);
  const selectedCast = useMemo(() => {
    if (!sortedCasts.length) return null;
    let low = 0;
    let high = sortedCasts.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (sortedCasts[middle].time < cursor) low = middle + 1;
      else high = middle;
    }
    const before = sortedCasts[Math.max(0, low - 1)];
    const after = sortedCasts[Math.min(sortedCasts.length - 1, low)];
    return Math.abs(before.time - cursor) <= Math.abs(after.time - cursor) ? before : after;
  }, [cursor, sortedCasts]);
  const selectedAbility = selectedCast ? byId.get(selectedCast.abilityId) : null;
  const resourceLabel = result.resourceLabel ?? (lang === "ru" ? "Ресурс" : "Resource");

  return (
    <section id="rotation-timeline" className={styles.timelinePanel} aria-labelledby="timeline-title">
      <div className={styles.timelineToolbar}>
        <div><h2 id="timeline-title">{tr("Simulation Timeline")}</h2><span><MoveHorizontal /> {tr("Drag horizontally or choose a scale")}</span></div>
        <div className={styles.timelineZoom} role="group" aria-label={tr("Timeline scale")}>{(["fit", "60", "30"] as const).map((value) => <button key={value} aria-pressed={zoom === value} onClick={() => setZoom(value)}>{value === "fit" ? tr("Full fight") : `${value} ${lang === "ru" ? "с" : "s"}`}</button>)}</div>
      </div>
      <div className={styles.timelineLegend} aria-label={tr("Timeline legend")}><span>{tr("Global Cooldowns")}</span><span>{tr("Major Cooldowns")}</span><span>{tr("Procs")}</span><span>{tr("Resource")}</span></div>
      <div className={deferredLabStyles.timelineScrollHint}><MoveHorizontal /> {tr("Swipe to explore the fight")}</div>
      <div className={deferredLabStyles.timelineScroller}>
        <div className={styles.timelineCanvas} style={{ width: canvasWidth }}>
          <header className={styles.timelineAxis}><span aria-hidden="true" /><div>{ticks.map((tick) => <time key={tick} style={{ left: position(tick, result.fightLengthSeconds) }}>{stamp(tick)}</time>)}</div></header>
          <div className={deferredLabStyles.timelineViewport}>
            <div className={deferredLabStyles.cursor} style={{ left: position(cursor, result.fightLengthSeconds) }}><span>{stamp(cursor)}</span></div>
            <div className={styles.timelineLane}><b>{tr("Boss Events")}</b><div>{result.bossEvents.map((event, index) => <button key={`${event.label}-${index}`} className={styles[event.tone]} style={{ left: position(event.time, result.fightLengthSeconds), width: `${(event.duration / result.fightLengthSeconds) * 100}%` }} onClick={() => onCursor(event.time)}>{tr(event.label)}</button>)}</div></div>
            <TimelineTracks result={result} abilities={abilities} lang={lang} onCursor={onCursor} />
          </div>
        </div>
      </div>
      <label className={styles.scrubber}><span>{tr("Timeline cursor")}: {stamp(cursor)}</span><input aria-label={tr("Timeline cursor")} type="range" min="0" max={result.fightLengthSeconds} step="1" value={cursor} onChange={(event) => onCursor(Number(event.target.value))} /></label>
      <div className={styles.selectedEvent} aria-live="polite"><MousePointer2 />{selectedAbility && selectedCast ? <><AbilityIcon ability={selectedAbility} size="sm" /><span><small>{tr("Nearest action")}</small><strong>{selectedAbility.name}</strong></span><time>{stamp(selectedCast.time)}</time></> : <span>{tr("Select an action on the timeline")}</span>}</div>
    </section>
  );
}
