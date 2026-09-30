import { CheckCircle2, Clock3, DatabaseZap } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { RotationSimulationResult } from "@/lib/platform/rotation/types";
import styles from "./rotationLab.module.css";
import deferredLabStyles from "./rotationLabDeferred.module.css";

function compactDps(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : `${Math.round(value / 1000)}K`;
}

function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${38 - ((value - min) / range) * 34}`).join(" ");
  return <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} /></svg>;
}

export function MetricCards({ result, lang, stale = false, lastRunAt }: {
  result: RotationSimulationResult;
  lang: Lang;
  stale?: boolean;
  lastRunAt?: number | null;
}) {
  const tr = t(lang);
  const liveSimC = result.engine.startsWith("SimulationCraft");
  const labels = {
    "single-target": tr("Single Target Simulation"),
    aoe: tr("AoE Simulation"),
    execute: tr("Execute Simulation"),
  };
  return (
    <section className={styles.metricGrid} aria-label={tr("Simulation metrics")}>
      <article className={styles.metricCard}>
        <header>
          <span>{labels[result.scenario]}</span>
          <span className={deferredLabStyles.metricBadges}>
            <small>{result.baselineIncluded === false ? (lang === "ru" ? "Оценка кандидата" : "Candidate score") : result.baselineDelta === 0 ? tr("Baseline") : `${result.baselineDelta > 0 ? "+" : ""}${result.baselineDelta}%`}</small>
            <small className={stale ? deferredLabStyles.metricStale : deferredLabStyles.metricLive}><CheckCircle2 /> {stale ? tr("Outdated result") : tr("Live result")}</small>
          </span>
        </header>
        <div className={styles.metricPrimary}><strong>{compactDps(result.dps)}</strong><span>DPS</span><Sparkline values={result.dpsSeries} /></div>
        <div className={styles.metricRows}>{result.metrics.map((metric) => <span key={metric.label}><strong>{metric.value}</strong><small>{tr(metric.label)}</small></span>)}</div>
      </article>
      <article className={styles.detailCard}>
        <header><span>{tr("Simulation Details")}</span><small><DatabaseZap /> {liveSimC ? "SIMULATIONCRAFT" : lang === "ru" ? "ЛОКАЛЬНЫЙ РАСЧЁТ" : "LOCAL CALCULATION"}</small></header>
        <dl>
          <div><dt>{tr("Fight Length")}</dt><dd>{result.fightLengthSeconds} {lang === "ru" ? "с" : "s"}</dd></div>
          <div><dt>{tr("Targets")}</dt><dd>{result.targets}</dd></div>
          <div><dt>{tr("Iterations")}</dt><dd>{result.iterations.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")}</dd></div>
          <div><dt>{tr("Engine")}</dt><dd>{liveSimC ? result.engine : lang === "ru" ? "Встроенная модель Gildra" : "Gildra built-in model"}</dd></div>
        </dl>
        <div className={deferredLabStyles.detailFooter}>
          <div className={deferredLabStyles.confidence}><strong>{result.confidence}%</strong><span>{tr("Confidence")}</span></div>
          {lastRunAt && <time dateTime={new Date(lastRunAt).toISOString()}><Clock3 /> {tr("Calculated just now")}</time>}
        </div>
      </article>
    </section>
  );
}
