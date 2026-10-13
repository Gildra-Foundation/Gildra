"use client";

import { useMemo } from "react";
import { Activity, AlertTriangle, CheckCircle2, Gauge, Sparkles, TimerReset } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { rotationT as t } from "@/lib/platform/rotation/rotationDictionary";
import type { RotationResourceTrack, RotationSimulationResult } from "@/lib/platform/rotation/types";
import styles from "./rotationLab.module.css";
import deferredLabStyles from "./rotationLabDeferred.module.css";
import { combatStateInspectorCopy } from "./combatStateInspectorCopy";

const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function resourceAt(track: RotationResourceTrack, cursor: number) {
  if (!track.points.length) return 0;
  let low = 0;
  let high = track.points.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (track.points[middle].time < cursor) low = middle + 1;
    else high = middle;
  }
  const before = track.points[Math.max(0, low - 1)];
  const after = track.points[Math.min(track.points.length - 1, low)];
  const point = Math.abs(before.time - cursor) <= Math.abs(after.time - cursor) ? before : after;
  return point ? Math.round((point.value / 100) * track.maximum) : 0;
}

const considerationRu: Record<string, string> = {
  "global cooldown": "Глобальный кулдаун",
  "ability cooldowns": "Кулдауны способностей",
  resources: "Ресурсы",
  "active buffs and procs": "Активные баффы и проки",
  talents: "Таланты",
  "target count": "Количество целей",
  "execute conditions": "Условия добивания",
  "priority order": "Порядок приоритета",
  "encounter type": "Тип боя",
};

export function CombatStateInspector({ result, lang, cursor, onCursor }: {
  result: RotationSimulationResult;
  lang: Lang;
  cursor: number;
  onCursor: (time: number) => void;
}) {
  const ru = lang === "ru";
  const exactMechanics = Boolean(result.accuracy?.mode.startsWith("simulationcraft-"));
  const resources = result.resources ?? [];
  const cooldowns = result.cooldowns ?? [];
  const procs = result.procs ?? [];
  const procGroups = useMemo(() => [...procs.reduce((groups, proc) => {
    const current = groups.get(proc.name) ?? { name: proc.name, firstTime: proc.time, count: 0, duration: 0 };
    current.count += 1;
    current.duration += proc.duration;
    current.firstTime = Math.min(current.firstTime, proc.time);
    groups.set(proc.name, current);
    return groups;
  }, new Map<string, { name: string; firstTime: number; count: number; duration: number }>()).values()].sort((left, right) => left.firstTime - right.firstTime), [procs]);

  return (
    <section className={styles.combatState} aria-labelledby="combat-state-title">
      <header className={styles.combatStateHeader}>
        <span className={exactMechanics ? deferredLabStyles.combatVerified : deferredLabStyles.combatEstimated}>{exactMechanics ? <CheckCircle2 /> : <AlertTriangle />}</span>
        <div>
          <small>{combatStateInspectorCopy[lang].combatModelCheck}</small>
          <h3 id="combat-state-title">{exactMechanics ? combatStateInspectorCopy[lang].mechanicsCalculatedBySimulationcraft : combatStateInspectorCopy[lang].trainingModelNotAn}</h3>
          <p>{exactMechanics ? combatStateInspectorCopy[lang].theAplPicksThe : combatStateInspectorCopy[lang].doNotTreatThis}</p>
        </div>
        <time>{stamp(cursor)}</time>
      </header>

      <div className={styles.combatChecks} aria-label={combatStateInspectorCopy[lang].whatTheSimulationConsiders}>
        {(result.accuracy?.considers ?? []).map((item) => <span key={item}><CheckCircle2 /> {ru ? (considerationRu[item] ?? item) : item}</span>)}
      </div>

      <div className={deferredLabStyles.combatStateGrid}>
        <article className={styles.resourceState}>
          <header><Gauge /><span><small>{combatStateInspectorCopy[lang].resourceState}</small><strong>{combatStateInspectorCopy[lang].atSelectedTime}</strong></span></header>
          {resources.length ? <div className={deferredLabStyles.resourceTrackList}>{resources.map((resource) => {
            const current = resourceAt(resource, cursor);
            const percent = resource.maximum ? Math.min(100, (current / resource.maximum) * 100) : 0;
            return <div key={resource.key} className={styles.resourceTrackCard}>
              <div><strong>{resource.label}</strong><span>{current} / {resource.maximum}</span></div>
              <i><span style={{ width: `${percent}%` }} /></i>
              <small>{combatStateInspectorCopy[lang].average} {resource.average} · {combatStateInspectorCopy[lang].peak} {resource.peak} · {combatStateInspectorCopy[lang].efficiency} {resource.efficiency}%</small>
            </div>;
          })}</div> : <p className={deferredLabStyles.combatEmpty}>{combatStateInspectorCopy[lang].theEngineReturnedNo}</p>}
        </article>

        <article className={styles.cooldownState}>
          <header><TimerReset /><span><small>{combatStateInspectorCopy[lang].cooldowns}</small><strong>{combatStateInspectorCopy[lang].observedUses}</strong></span></header>
          {cooldowns.length ? <ul>{cooldowns.map((cooldown) => <li key={cooldown.abilityId}><span><strong>{cooldown.name}</strong><small>{cooldown.duration ? `${combatStateInspectorCopy[lang].unitCd} ≈ ${cooldown.duration} ${combatStateInspectorCopy[lang].unitS}` : cooldown.averageInterval ? `${combatStateInspectorCopy[lang].interval} ≈ ${cooldown.averageInterval} ${combatStateInspectorCopy[lang].unitS}` : combatStateInspectorCopy[lang].singleUse}</small></span><div>{cooldown.uses.slice(0, 5).map((time) => <button type="button" key={time} onClick={() => onCursor(time)} aria-label={`${cooldown.name} ${stamp(time)}`}>{stamp(time)}</button>)}</div></li>)}</ul> : <p className={deferredLabStyles.combatEmpty}>{combatStateInspectorCopy[lang].noDistinctMajorCooldowns}</p>}
        </article>

        <article className={styles.procState}>
          <header><Sparkles /><span><small>{combatStateInspectorCopy[lang].procsBuffs}</small><strong>{combatStateInspectorCopy[lang].activeWindows}</strong></span></header>
          {procGroups.length ? <ul>{procGroups.map((proc) => <li key={proc.name}><button type="button" onClick={() => onCursor(proc.firstTime)}><Activity /><span><strong>{proc.name}</strong><small>{proc.count} {combatStateInspectorCopy[lang].windows} · {Math.round(proc.duration * 10) / 10} {combatStateInspectorCopy[lang].unitS}</small></span></button></li>)}</ul> : <p className={deferredLabStyles.combatEmpty}>{combatStateInspectorCopy[lang].noDistinctProcWindows}</p>}
        </article>
      </div>

      {Boolean(result.accuracy?.limitations?.length) && <aside className={styles.combatLimitations}><AlertTriangle /><span><strong>{combatStateInspectorCopy[lang].whatIsNotPersonalized}</strong><ul>{result.accuracy!.limitations.map((item) => <li key={item}>{ru ? translateLimitation(item) : item}</li>)}</ul></span></aside>}
    </section>
  );
}

function translateLimitation(item: string) {
  if (item.startsWith("Damage is for")) return "DPS рассчитан на эталонной экипировке, а не на вашем персонаже Battle.net.";
  if (item.startsWith("The trainer priority")) return "Ручной порядок в тренажёре не заменяет полноценный APL специализации.";
  if (item.startsWith("Damage alone")) return "Для лекарей и поддерживающих специализаций один DPS не отражает эффективность.";
  if (item.startsWith("Estimated training")) return "Это учебная оценка, а не игровой симулятор точного урона.";
  if (item.startsWith("Results are a simulation")) return "Результат рассчитан по последнему снимку Battle.net и не гарантирует идентичный урон в конкретном бою.";
  return t("ru")(item);
}
