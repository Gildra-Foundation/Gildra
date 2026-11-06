"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, LoaderCircle, Square, TrendingUp, WandSparkles } from "lucide-react";
import type { TalentCalculatorData } from "@/lib/talentCalculatorData";
import { type TalentScenarioId } from "@/lib/wow/testCharacterTalentAudit";
import { talentText, type TalentLang } from "@/components/talents/talentLocale";
import { MaterialButton } from "@/components/wow/shared/materialAtlas";
import { TALENTS_KIT } from "@/lib/wow/charactersKit";
import styles from "./characterTalentOptimizer.module.css";
import tools from "./characterTools.module.css";

type OptimizerScenario = "solo-pve" | "pve-aoe" | "mythic-plus" | "raid";
type OptimizerChange = { nodeId: number; nodeKey: string; name: string; rankDelta: number; choiceFrom?: number; choiceTo?: number };
type OptimizerEntry = {
  candidateId: string; loadout: string; tree: "class" | "hero" | "spec"; kind: "choice" | "rank-swap";
  changes: OptimizerChange[]; dps: number; dpsError: number; deltaDps: number; deltaPercent: number; marginDps: number; significant: boolean;
  singleTargetDps?: number; singleTargetDeltaPercent?: number; aoeDps?: number; aoeDeltaPercent?: number;
};
type OptimizerSimulation = { dps: number; dpsError: number; engine: string; iterations: number; confidence: number; fromCache: boolean };
type OptimizerJob = {
  id: string; status: "queued" | "running" | "completed" | "cancelled" | "failed";
  phase: "queued" | "baseline" | "candidates" | "crosscheck" | "verification"; completed: number; total: number;
  results: OptimizerEntry[]; error: string | null;
  result: null | { baseline: OptimizerSimulation; results: OptimizerEntry[]; winner: OptimizerEntry | null; verification: OptimizerSimulation | null; verifiedWinnerDpsDelta: number | null };
};

function errorMessage(code: string | null, lang: TalentLang) {
  return {
    optimizer_rate_limited: talentText(lang, "Слишком много подборов. Подождите минуту."),
    simulation_unavailable: talentText(lang, "Расчёт сейчас недоступен. Попробуйте позже."),
    unsupported_combat_model: talentText(lang, "Подбор недоступен для этой роли."),
    battle_net_session_required: talentText(lang, "Войдите в Battle.net повторно."),
    active_specialization_changed: talentText(lang, "Специализация изменилась. Обновите профиль."),
  }[code ?? ""] ?? talentText(lang, "Подбор не завершился. Попробуйте ещё раз.");
}

function changeLabel(change: OptimizerChange) {
  return `${change.rankDelta > 0 ? "+" : change.rankDelta < 0 ? "−" : "↔"} ${change.name}`;
}

const optimizerScenarios: readonly OptimizerScenario[] = ["solo-pve", "pve-aoe", "mythic-plus", "raid"];
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;

export function CharacterTalentOptimizer({
  data, characterSlug, specSlug, scenario, dataMode, resetKey, onApply, lang = "ru",
}: {
  lang?: TalentLang;
  data: TalentCalculatorData;
  characterSlug: string;
  specSlug: string;
  scenario: TalentScenarioId;
  dataMode: "fixture" | "battle-net";
  resetKey: string;
  onApply: (loadout: string) => boolean;
}) {
  const selectedScenario: OptimizerScenario = optimizerScenarios.includes(scenario as OptimizerScenario) ? scenario as OptimizerScenario : "mythic-plus";
  const [job, setJob] = useState<OptimizerJob | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [scope, setScope] = useState(resetKey);
  const polling = useRef<AbortController | null>(null);
  const icons = useMemo(() => new Map(Object.values(data.trees).flatMap((tree) => tree.nodes.map((node) => [node.id, node.choices[0]?.iconUrl ?? ""] as const))), [data]);
  const running = job?.status === "queued" || job?.status === "running";

  // A new character profile drops the previous job (state reset during render, no effect cascade).
  if (scope !== resetKey) { setScope(resetKey); setJob(null); setRequestError(null); setAppliedId(null); }
  useEffect(() => () => polling.current?.abort(), [resetKey]);

  const readUntilDone = async (id: string, signal: AbortSignal) => {
    while (!signal.aborted) {
      const response = await fetch("/api/wow/talent-optimizer?id=" + encodeURIComponent(id) + "&dataMode=" + dataMode, { signal, cache: "no-store" });
      const payload = await response.json() as OptimizerJob & { error?: string };
      if (!response.ok) throw new Error(payload.error || "optimizer_job_not_found");
      setJob(payload);
      if (["completed", "failed", "cancelled"].includes(payload.status)) return;
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(resolve, 700);
        signal.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
      });
    }
  };

  const start = async () => {
    polling.current?.abort();
    const controller = new AbortController();
    polling.current = controller;
    setRequestError(null);
    setAppliedId(null);
    setJob({ id: "", status: "queued", phase: "queued", completed: 0, total: 10, results: [], result: null, error: null });
    try {
      const response = await fetch("/api/wow/talent-optimizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterSlug, spec: specSlug, scenario: selectedScenario, dataMode, maxCandidates: 8, lang }),
        signal: controller.signal,
      });
      const payload = await response.json() as OptimizerJob & { error?: string };
      if (!response.ok) throw new Error(payload.error || "optimizer_start_failed");
      setJob(payload);
      await readUntilDone(payload.id, controller.signal);
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") setRequestError(errorMessage(error.message, lang));
    }
  };

  const cancel = async () => {
    const id = job?.id;
    polling.current?.abort();
    if (!id) { setJob(null); return; }
    try {
      const response = await fetch("/api/wow/talent-optimizer?id=" + encodeURIComponent(id) + "&dataMode=" + dataMode, { method: "DELETE" });
      const payload = await response.json() as OptimizerJob;
      if (response.ok) setJob(payload);
    } catch { setJob(null); }
  };

  const apply = (entry: OptimizerEntry) => {
    if (!onApply(entry.loadout)) { setRequestError(talentText(lang, "Этот вариант больше не подходит к дереву талантов.")); return; }
    setAppliedId(entry.candidateId);
  };

  const results = job?.result?.results ?? job?.results ?? [];
  const baseline = job?.result?.baseline;
  const verification = job?.result?.verification;
  const verifiedDelta = baseline && verification ? verification.dps - baseline.dps : null;
  const verifiedPercent = verifiedDelta !== null && baseline!.dps > 0 ? verifiedDelta / baseline!.dps * 100 : null;
  const winnerMargin = baseline && verification ? 1.96 * Math.hypot(baseline.dpsError, verification.dpsError) : 0;
  const provenGain = verifiedDelta !== null && verifiedDelta > winnerMargin;
  const phase = job?.phase === "baseline" ? talentText(lang, "Считаем текущий билд") : job?.phase === "verification" || job?.phase === "crosscheck" ? talentText(lang, "Перепроверяем лучший вариант") : talentText(lang, "Сравниваем варианты");

  return <section className={`${tools.tool} ${styles.optimizer}`} aria-labelledby="talent-optimizer-title">
    <div className={tools.head}>
      <h3 className={tools.title} id="talent-optimizer-title">{talentText(lang, "Найти более сильный вариант")}</h3>
      <div className={tools.actions}>
        {running ? <button type="button" className={tools.quiet} onClick={cancel}><Square aria-hidden="true" />{talentText(lang, "Остановить")}</button> : null}
        <MaterialButton kit={TALENTS_KIT} fit="stack" variant="primary" type="button" onClick={start} disabled={running} icon={running ? <LoaderCircle className={tools.spin} aria-hidden="true" /> : <WandSparkles aria-hidden="true" />}>{job?.status === "completed" ? talentText(lang, "Подобрать заново") : talentText(lang, "Начать подбор")}</MaterialButton>
      </div>
    </div>

    {running ? <div className={styles.progress} role="status" aria-live="polite"><span className={tools.status}>{phase} · {job.completed}/{job.total}</span><div className={tools.progress} aria-hidden="true"><i style={{ width: `${Math.min(100, job.completed / Math.max(1, job.total) * 100)}%` }} /></div></div> : null}
    {requestError || job?.status === "failed" ? <p className={tools.alert} role="alert"><AlertTriangle aria-hidden="true" />{requestError ?? errorMessage(job?.error ?? null, lang)}</p> : null}
    {job?.status === "cancelled" ? <p className={tools.status} role="status">{talentText(lang, "Подбор остановлен")}</p> : null}

    {job?.status === "completed" && baseline && verification ? <p className={styles.summary} data-gain={provenGain || undefined}>
      {provenGain ? <TrendingUp aria-hidden="true" /> : <Check aria-hidden="true" />}
      <b>{provenGain ? `${talentText(lang, "Найден прирост ")}${verifiedPercent!.toFixed(2)}%` : talentText(lang, "Сильнее варианта рядом не найдено")}</b>
      <span>{baseline.dps.toLocaleString(numberLocale[lang])} → {verification.dps.toLocaleString(numberLocale[lang])} DPS</span>
    </p> : null}

    {results.length ? <ol className={styles.results} aria-label={talentText(lang, "Лучшие найденные варианты")}>{results.slice(0, 3).map((entry) => {
      const meaningful = entry.deltaDps > entry.marginDps;
      return <li key={entry.candidateId} data-positive={meaningful}>
        <div className={styles.changes}>{entry.changes.map((change) => <span key={[entry.candidateId, change.nodeKey, change.rankDelta].join("-")}><img src={icons.get(change.nodeKey) || "/assets/wow/icon-unverified.svg"} alt="" width={28} height={28} /><em>{changeLabel(change)}</em></span>)}</div>
        <div className={styles.numbers}><strong>{signed(entry.deltaPercent)}</strong>{typeof entry.singleTargetDeltaPercent === "number" ? <span>{talentText(lang, "Одна цель")} {signed(entry.singleTargetDeltaPercent)}</span> : null}{typeof entry.aoeDeltaPercent === "number" ? <span>{talentText(lang, "Пачка")} {signed(entry.aoeDeltaPercent)}</span> : null}</div>
        <button type="button" className={tools.quiet} onClick={() => apply(entry)} aria-pressed={appliedId === entry.candidateId}>{appliedId === entry.candidateId ? <><Check aria-hidden="true" />{talentText(lang, "Применён")}</> : talentText(lang, "Применить")}</button>
      </li>;
    })}</ol> : null}
  </section>;
}

const numberLocale: Record<TalentLang, string> = { ru: "ru-RU", en: "en-US" };
