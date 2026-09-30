"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, LoaderCircle, Square, TrendingUp, WandSparkles } from "lucide-react";
import type { TalentCalculatorData } from "@/lib/talentCalculatorData";
import { type TalentScenarioId } from "@/lib/wow/testCharacterTalentAudit";
import { talentText, localizedTalentScenarios, type TalentLang } from "@/components/talents/talentLocale";
import styles from "./characterTalentOptimizer.module.css";
import book from "./talentBookLeaves.module.css";

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
    optimizer_rate_limited: talentText(lang, "Слишком много подборов за минуту. Готовые результаты не потеряны — подождите и запустите новый поиск."),
    simulation_unavailable: talentText(lang, "SimulationCraft временно недоступен. Уже рассчитанные варианты сохранены ниже."),
    unsupported_combat_model: talentText(lang, "Для этой роли пока нет корректной модели DPS. Фальшивый результат показывать не будем."),
    battle_net_session_required: talentText(lang, "Сессия Battle.net закончилась. Войдите снова и повторите подбор."),
    active_specialization_changed: talentText(lang, "Активная специализация изменилась. Обновите профиль персонажа."),
    cancelled: talentText(lang, "Подбор остановлен. Уже готовые варианты оставлены на экране."),
  }[code ?? ""] ?? talentText(lang, "Подбор не завершился. Попробуйте ещё раз через несколько секунд.");
}

function changeLabel(change: OptimizerChange, lang: TalentLang) {
  const name = change.name;
  if (change.rankDelta > 0) return talentText(lang, "Добавить «") + name + (lang === "ru" ? "»" : "”");
  if (change.rankDelta < 0) return talentText(lang, "Убрать «") + name + (lang === "ru" ? "»" : "”");
  return talentText(lang, "Сменить вариант на «") + name + (lang === "ru" ? "»" : "”");
}

export function CharacterTalentOptimizer({
  data, characterSlug, specSlug, scenario, dataMode, resetKey, onScenarioChange, onApply, lang = "ru",
}: {
  lang?: TalentLang;
  data: TalentCalculatorData;
  characterSlug: string;
  specSlug: string;
  scenario: TalentScenarioId;
  dataMode: "fixture" | "battle-net";
  resetKey: string;
  onScenarioChange: (scenario: TalentScenarioId) => void;
  onApply: (loadout: string) => boolean;
}) {
  const modes = useMemo(() => localizedTalentScenarios(lang).filter((entry) => entry.group === "PvE") as Array<ReturnType<typeof localizedTalentScenarios>[number] & { id: OptimizerScenario }>, [lang]);
  const treeLabels = { class: talentText(lang, "класс"), hero: talentText(lang, "герой"), spec: talentText(lang, "специализация") };
  const initialScenario: OptimizerScenario = modes.some((entry) => entry.id === scenario) ? scenario as OptimizerScenario : "mythic-plus";
  const [selectedScenario, setSelectedScenario] = useState<OptimizerScenario>(initialScenario);
  const [job, setJob] = useState<OptimizerJob | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const polling = useRef<AbortController | null>(null);
  const icons = useMemo(() => new Map(Object.values(data.trees).flatMap((tree) => tree.nodes.map((node) => [node.id, node.choices[0]?.iconUrl ?? ""] as const))), [data]);
  const running = job?.status === "queued" || job?.status === "running";

  useEffect(() => () => polling.current?.abort(), []);
  useEffect(() => {
    polling.current?.abort();
    setJob(null);
    setRequestError(null);
    setAppliedId(null);
  }, [resetKey]);
  useEffect(() => {
    if (!running && modes.some((entry) => entry.id === scenario)) setSelectedScenario(scenario as OptimizerScenario);
  }, [running, scenario, modes]);

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
    } catch { setRequestError(talentText(lang, "Не удалось подтвердить отмену, но браузер перестал ждать результат.")); }
  };

  const apply = (entry: OptimizerEntry) => {
    if (!onApply(entry.loadout)) { setRequestError(talentText(lang, "Этот вариант не загрузился: версия дерева талантов изменилась.")); return; }
    setAppliedId(entry.candidateId);
    onScenarioChange(selectedScenario);
  };

  const results = job?.result?.results ?? job?.results ?? [];
  const winner = job?.result?.winner ?? results[0] ?? null;
  const baseline = job?.result?.baseline;
  const verification = job?.result?.verification;
  const verifiedDelta = baseline && verification ? verification.dps - baseline.dps : null;
  const verifiedPercent = verifiedDelta !== null && baseline!.dps > 0 ? verifiedDelta / baseline!.dps * 100 : null;
  const winnerMargin = baseline && verification ? 1.96 * Math.hypot(baseline.dpsError, verification.dpsError) : 0;
  const provenGain = verifiedDelta !== null && verifiedDelta > winnerMargin;

  return <section className={`${styles.optimizer} ${book.optimizer}`} aria-labelledby="talent-optimizer-title">
    <header className={styles.heading}>
      <span><WandSparkles aria-hidden="true" /></span>
      <div><small>{talentText(lang, "АВТОПОДБОР ТАЛАНТОВ")}</small><h3 id="talent-optimizer-title">{talentText(lang, "Найти более сильный вариант")}</h3><p>{talentText(lang, "Проверим близкие варианты по одному очку на вашем снаряжении. Это поиск рядом с текущим билдом, а не перебор всех билдов.")}</p></div>
    </header>

    <div className={`${styles.controls} ${book.controls}`}>
      <fieldset disabled={running}>
        <legend>{talentText(lang, "Для какого боя подбирать")}</legend>
        <div className={`${styles.scenarios} ${book.modes}`}>{modes.map((mode) => <button data-folio-choice key={mode.id} type="button" aria-pressed={selectedScenario === mode.id} onClick={() => { setSelectedScenario(mode.id); onScenarioChange(mode.id); }}><b>{mode.label}</b><span>{mode.fight}</span></button>)}</div>
      </fieldset>
      <div className={styles.actions}>
        {running ? <button type="button" className={styles.cancelButton} data-folio-action="quiet" onClick={cancel}><Square aria-hidden="true" />{talentText(lang, "Остановить")}</button> : null}
        <button type="button" className={styles.startButton} data-folio-action onClick={start} disabled={running}><WandSparkles aria-hidden="true" />{job?.status === "completed" ? talentText(lang, "Подобрать заново") : talentText(lang, "Начать подбор")}</button>
      </div>
    </div>

    {running ? <div className={styles.progress} role="status" aria-live="polite">
      <LoaderCircle aria-hidden="true" /><div><b>{job.phase === "baseline" ? talentText(lang, "Считаем текущий билд") : job.phase === "crosscheck" ? talentText(lang, "Проверяем лучшие варианты в одну цель и по пачке") : job.phase === "verification" ? talentText(lang, "Перепроверяем лучший вариант") : talentText(lang, "Сравниваем варианты")}</b><span>{job.completed} {talentText(lang, " из ")}{job.total} {talentText(lang, " расчётов завершено. Уже готовые результаты не пропадут при остановке.")}</span><progress value={job.completed} max={job.total || 1}>{job.completed}/{job.total}</progress></div>
    </div> : null}

    {requestError || job?.status === "failed" ? <div className={styles.error} role="alert"><AlertTriangle aria-hidden="true" /><span><b>{talentText(lang, "Подбор остановился")}</b>{requestError ?? errorMessage(job?.error ?? null, lang)}</span></div> : null}
    {job?.status === "cancelled" ? <div className={styles.cancelled} role="status"><Square aria-hidden="true" /><span><b>{talentText(lang, "Подбор остановлен")}</b>{results.length ? talentText(lang, "Сохранили ") + results.length + talentText(lang, " уже рассчитанных вариантов.") : talentText(lang, "Ни один кандидат ещё не успел рассчитаться.")}</span></div> : null}

    {job?.status === "completed" && winner && baseline && verification ? <div className={`${styles.summary} ${book.insert}${provenGain ? " " + styles.summaryGain : ""}`} data-book-surface="foldout">
      {provenGain ? <TrendingUp aria-hidden="true" /> : <Check aria-hidden="true" />}
      <span><small>{talentText(lang, "ПРОВЕРЕННЫЙ ИТОГ")}</small><b>{provenGain ? talentText(lang, "Найден прирост ") + verifiedPercent!.toFixed(2) + "%" : talentText(lang, "Доказанного улучшения рядом не найдено")}</b><em>{baseline.dps.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")} → {verification.dps.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")} {talentText(lang, " DPS · погрешность разницы ±")}{Math.round(winnerMargin).toLocaleString(lang === "ru" ? "ru-RU" : "en-US")} DPS</em></span>
    </div> : null}

    {results.length ? <div className={`${styles.results} ${book.insert}`} data-book-surface="foldout" aria-label={talentText(lang, "Лучшие найденные варианты")}>
      <header><div><small>{talentText(lang, "РЕЗУЛЬТАТЫ")}</small><h4>{job?.status === "completed" ? talentText(lang, "Лучшие варианты") : talentText(lang, "Уже рассчитано")}</h4></div><span>{talentText(lang, "Сравнение с текущим билдом")}</span></header>
      <ol>{results.slice(0, 3).map((entry, index) => {
        const meaningful = entry.deltaDps > entry.marginDps;
        return <li key={entry.candidateId} data-positive={meaningful}>
          <div className={styles.rank}>{index + 1}</div>
          <div className={styles.variant}>
            <div className={styles.variantHead}><span><b>{index === 0 ? talentText(lang, "Лучший найденный") : talentText(lang, "Вариант ") + (index + 1)}</b><small>{treeLabels[entry.tree]} · {entry.kind === "rank-swap" ? talentText(lang, "перестановка очка") : talentText(lang, "смена выбора")}</small></span><strong>{entry.deltaPercent > 0 ? "+" : ""}{entry.deltaPercent.toFixed(2)}%</strong></div>
            <div className={styles.changes}>{entry.changes.map((change) => <span key={[entry.candidateId, change.nodeKey, change.rankDelta].join("-")}><img src={icons.get(change.nodeKey) || "/assets/wow/icon-unverified.svg"} alt="" /><em>{changeLabel(change, lang)}</em></span>)}</div>
            <div className={styles.numbers}><span>{talentText(lang, "Одна цель: ")}{typeof entry.singleTargetDeltaPercent === "number" ? (entry.singleTargetDeltaPercent > 0 ? "+" : "") + entry.singleTargetDeltaPercent.toFixed(2) + "%" : talentText(lang, "считается")}</span><span>{talentText(lang, "Пачка врагов: ")}{typeof entry.aoeDeltaPercent === "number" ? (entry.aoeDeltaPercent > 0 ? "+" : "") + entry.aoeDeltaPercent.toFixed(2) + "%" : talentText(lang, "считается")}</span><span>{entry.dps.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")} {talentText(lang, " DPS в выбранном режиме")}</span><span>{meaningful ? talentText(lang, "выше погрешности") : talentText(lang, "в пределах погрешности")}</span></div>
          </div>
          <button data-folio-action type="button" onClick={() => apply(entry)}>{appliedId === entry.candidateId ? <><Check aria-hidden="true" />{talentText(lang, "Применён")}</> : talentText(lang, "Применить")}</button>
        </li>;
      })}</ol>
      <p>{talentText(lang, "После применения дерево и показатели урона ниже пересчитаются. Сохранить вариант можно в разделе «Мои варианты».")}</p>
    </div> : null}
  </section>;
}
