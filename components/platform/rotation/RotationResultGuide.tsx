"use client";

import { ArrowRight, CheckCircle2, Crosshair, Dumbbell } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { RotationSimulationResult } from "@/lib/platform/rotation/types";
import styles from "./rotationLab.module.css";
import deferredLabStyles from "./rotationLabDeferred.module.css";

const compactDps = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : `${Math.round(value / 1000)}K`;

export function RotationResultGuide({ lang, result, onFinding, onTraining }: {
  lang: Lang;
  result: RotationSimulationResult;
  onFinding: (time: number) => void;
  onTraining: () => void;
}) {
  const ru = lang === "ru";
  const firstFinding = result.findings[0];
  return (
    <section className={styles.resultGuide} aria-labelledby="result-guide-title">
      <div className={deferredLabStyles.resultGuideLead}>
        <CheckCircle2 />
        <span>
          <small>{ru ? "РАСЧЁТ ГОТОВ" : "SIMULATION READY"}</small>
          <h2 id="result-guide-title">{ru ? "Что делать с результатом" : "What to do with this result"}</h2>
        </span>
      </div>
      <div className={styles.resultGuideFact}>
        <strong>{compactDps(result.dps)} DPS</strong>
        <span>{ru ? "Это ориентир идеального прогона для выбранных условий, а не требование с первой попытки." : "This is an ideal-run benchmark for the selected setup, not a first-try requirement."}</span>
      </div>
      <div className={styles.resultGuideNext}>
        <b>{firstFinding ? (ru ? `Начни с одной ошибки из ${result.findings.length}` : `Start with one of ${result.findings.length} findings`) : (ru ? "Критичных ошибок нет" : "No critical findings")}</b>
        <span>{firstFinding ? (ru ? "Открой замечание — таймлайн сам перейдёт к нужной секунде." : "Open a finding and the timeline jumps to the exact second.") : (ru ? "Переходи к тренировке и закрепляй последовательность." : "Move to training and lock in the sequence.")}</span>
      </div>
      <div className={deferredLabStyles.resultGuideActions}>
        {firstFinding && <button type="button" onClick={() => onFinding(firstFinding.time)}><Crosshair /> {ru ? "Показать главную ошибку" : "Show main finding"}</button>}
        <button type="button" onClick={onTraining}><Dumbbell /> {ru ? "Перейти к тренировке" : "Go to training"}<ArrowRight /></button>
      </div>
    </section>
  );
}
