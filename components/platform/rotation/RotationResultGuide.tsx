"use client";

import { ArrowRight, CheckCircle2, Crosshair, Dumbbell } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { RotationSimulationResult } from "@/lib/platform/rotation/types";
import styles from "./rotationLab.module.css";
import deferredLabStyles from "./rotationLabDeferred.module.css";
import { rotationResultGuideCopy } from "./rotationResultGuideCopy";

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
          <small>{rotationResultGuideCopy[lang].simulationReady}</small>
          <h2 id="result-guide-title">{rotationResultGuideCopy[lang].whatToDoWith}</h2>
        </span>
      </div>
      <div className={styles.resultGuideFact}>
        <strong>{compactDps(result.dps)} DPS</strong>
        <span>{rotationResultGuideCopy[lang].thisIsAnIdeal}</span>
      </div>
      <div className={styles.resultGuideNext}>
        <b>{firstFinding ? (ru ? `Начни с одной ошибки из ${result.findings.length}` : `Start with one of ${result.findings.length} findings`) : rotationResultGuideCopy[lang].noCriticalFindings}</b>
        <span>{firstFinding ? rotationResultGuideCopy[lang].openAFindingAnd : rotationResultGuideCopy[lang].moveToTrainingAnd}</span>
      </div>
      <div className={deferredLabStyles.resultGuideActions}>
        {firstFinding && <button type="button" onClick={() => onFinding(firstFinding.time)}><Crosshair /> {rotationResultGuideCopy[lang].showMainFinding}</button>}
        <button type="button" onClick={onTraining}><Dumbbell /> {rotationResultGuideCopy[lang].goToTraining}<ArrowRight /></button>
      </div>
    </section>
  );
}
