"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Check, Clock3, ExternalLink, Link2, LoaderCircle, LogOut, Search, ShieldCheck, Skull, TimerReset, Zap } from "lucide-react";
import type { RotationAbility, RotationSimulationResult } from "@/lib/platform/rotation/types";
import type { WarcraftLogsAnalysis } from "@/lib/wow/warcraftLogsAnalysis";
import { characterLogsReturnTo } from "@/lib/wow/warcraftLogsRoutes";
import { WarcraftFrame } from "./WarcraftFrame";
import { characterWorkspaceCopy, workspaceLocale, workspaceNumber, workspaceVisibility, type WorkspaceLocale } from "./characterWorkspaceCopy";
import styles from "./characterLogAnalysis.module.css";

type Status = { configured: boolean; connected: boolean; error?: string };
type Report = { report: { code: string; title: string; visibility: string; zone: string }; actor: { id: number; name: string; server: string; class: string }; fights: Array<{ id: number; name: string; encounterID: number; durationSeconds: number; kill: boolean; difficulty?: number; specialization: string }> };
type ReportOption = { code: string; title: string; visibility: string; startTime: number; zone: string };

function extractCode(value: string) { return value.trim().match(/(?:reports\/)?([A-Za-z0-9]{16})(?:[/?#]|$)/)?.[1] ?? ""; }
function number(value: number, locale: WorkspaceLocale) { return workspaceNumber(locale, value); }

export function CharacterLogAnalysis({ characterSlug, specializationSlug, localePrefix, simulation, abilities }: { characterSlug: string; specializationSlug: string; localePrefix: "" | "/ru"; simulation: RotationSimulationResult | null; abilities: RotationAbility[] }) {
  const locale = workspaceLocale(localePrefix), t = characterWorkspaceCopy(locale);
  const [status, setStatus] = useState<Status | null>(null), [reportInput, setReportInput] = useState("");
  const [reports, setReports] = useState<ReportOption[]>([]);
  const [reportsState, setReportsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [oauthResult, setOauthResult] = useState<"connected" | "invalid_state" | "invalid_session" | "exchange_failed" | "">("");
  const [report, setReport] = useState<Report | null>(null), [fightID, setFightID] = useState(0);
  const [analysis, setAnalysis] = useState<WarcraftLogsAnalysis | null>(null), [busy, setBusy] = useState<"report" | "analysis" | "">("");
  const [error, setError] = useState("");
  const comparisonSimulation = simulation?.engine.startsWith("SimulationCraft") ? simulation : null;
  useEffect(() => {
    const url = new URL(window.location.href), result = url.searchParams.get("logs");
    if (result === "connected" || result === "invalid_state" || result === "invalid_session" || result === "exchange_failed") {
      setOauthResult(result);
      url.searchParams.delete("logs");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      window.requestAnimationFrame(() => document.getElementById("audit-logs")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
    fetch("/api/wow/logs/status", { cache: "no-store" }).then(async (response) => setStatus(await response.json() as Status)).catch(() => setStatus({ configured: false, connected: false, error: "unavailable" }));
  }, []);
  useEffect(() => {
    if (!status?.connected) return;
    setReportsState("loading");
    fetch("/api/wow/logs/reports", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401 || response.status === 403) { setStatus((value) => ({ configured: value?.configured ?? true, connected: false })); setReportsState("error"); return; }
      if (!response.ok) { setReportsState("error"); return; }
      const payload = await response.json() as { reports?: ReportOption[] };
      setReports(payload.reports ?? []);
      setReportsState("ready");
    }).catch(() => setReportsState("error"));
  }, [status?.connected]);
  const cooldowns = useMemo(() => {
    const byID = new Map(abilities.map((ability) => [ability.id, ability]));
    return (comparisonSimulation?.cooldowns ?? []).flatMap((cooldown) => {
      const ability = byID.get(cooldown.abilityId), interval = cooldown.averageInterval ?? (cooldown.uses.length > 1 ? (cooldown.uses.at(-1)! - cooldown.uses[0]) / (cooldown.uses.length - 1) : 0);
      return ability?.spellId && interval >= 1 ? [{ spellId: ability.spellId, name: cooldown.name || ability.name, expectedIntervalSeconds: interval, expectedFirstUseSeconds: cooldown.uses[0] ?? 0, expectedUses: cooldown.uses.slice(0, 20) }] : [];
    });
  }, [abilities, comparisonSimulation]);

  async function loadReport() {
    const code = extractCode(reportInput);
    if (!code) { setError(t("Вставьте код из 16 символов или полную ссылку Warcraft Logs.")); return; }
    setBusy("report"); setError(""); setAnalysis(null);
    try {
      const query = new URLSearchParams({ code, character: characterSlug });
      const response = await fetch(`/api/wow/logs/report?${query}`, { cache: "no-store" });
      const payload = await response.json() as Report & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "report_unavailable");
      if (!payload.fights?.length) throw new Error("no_character_fights");
      setReport(payload); setFightID(payload.fights[0].id);
    } catch (reason) { const code = reason instanceof Error ? reason.message : ""; if (code === "warcraft_logs_session_expired") setStatus((value) => ({ configured: value?.configured ?? true, connected: false })); setError(code === "character_not_in_report" ? t("Этот персонаж не участвовал в отчёте.") : (code === "no_character_fights" || code === "character_has_no_fights") ? t("Персонаж найден, но в отчёте нет завершённых боёв с его участием.") : code === "character_ambiguous" ? t("В отчёте несколько персонажей с таким именем, а сервер определить не удалось. Выберите другой отчёт.") : code === "warcraft_logs_session_expired" ? t("Доступ Warcraft Logs отозван или истёк. Подключите его заново.") : t("Отчёт не загрузился. Проверьте ссылку и доступ.")); }
    finally { setBusy(""); }
  }

  async function analyze() {
    if (!report || !fightID) return;
    setBusy("analysis"); setError(""); setAnalysis(null);
    try {
      const response = await fetch("/api/wow/logs/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: report.report.code, characterSlug, fightID, actorID: report.actor.id, specSlug: specializationSlug, locale, simDps: comparisonSimulation?.dps, simDurationSeconds: comparisonSimulation?.fightLengthSeconds, simTargets: comparisonSimulation?.targets, cooldowns }) });
      const payload = await response.json() as WarcraftLogsAnalysis & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "analysis_failed");
      setAnalysis(payload);
    } catch (reason) { const code = reason instanceof Error ? reason.message : ""; if (code === "warcraft_logs_session_expired") setStatus((value) => ({ configured: value?.configured ?? true, connected: false })); setError(code === "specialization_mismatch" ? t("В выбранном бою персонаж был в другой специализации.") : code === "character_actor_mismatch" ? t("Персонаж страницы не совпал с участником лога. Загрузите отчёт заново.") : code === "event_limit_exceeded" ? t("В бою слишком много событий для безопасного разбора. Выберите отдельный encounter, а не весь длинный лог.") : code === "warcraft_logs_session_expired" ? t("Доступ Warcraft Logs отозван или истёк. Подключите его заново.") : t("События боя временно недоступны.")); }
    finally { setBusy(""); }
  }

  async function disconnect() {
    setError("");
    const response = await fetch("/api/wow/logs/disconnect", { method: "POST" }).catch(() => null);
    if (!response?.ok) { setError(t("Не удалось отключить Warcraft Logs. Обновите страницу и попробуйте ещё раз.")); return; }
    setStatus((value) => ({ configured: value?.configured ?? true, connected: false })); setReport(null); setAnalysis(null);
  }

  if (!status) return <section className={styles.logs} id="audit-logs"><WarcraftFrame /><div className={styles.state}><LoaderCircle className={styles.spin} />{t("Проверяем Warcraft Logs…")}</div></section>;
  if (!status.configured) return <section className={styles.logs} id="audit-logs"><WarcraftFrame /><header><span><Activity /></span><div><small>{t("БОЕВОЙ ЖУРНАЛ")}</small><h2>{t("Разбор настоящего боя")}</h2><p>{t("Здесь можно будет сравнить расчёт с тем, что произошло в игре.")}</p></div></header><div className={styles.state}><ShieldCheck /><div><b>{t("Разбор боёв пока недоступен")}</b><span>{t("Это настройка сервиса; с вашим персонажем и аккаунтом всё в порядке.")}</span></div></div></section>;
  if (!status.connected) {
    const returnTo = characterLogsReturnTo(localePrefix, characterSlug);
    return <section className={styles.logs} id="audit-logs"><WarcraftFrame /><header><span><Activity /></span><div><small>{t("БОЕВОЙ ЖУРНАЛ")}</small><h2>{t("Разбор настоящего боя")}</h2><p>{t("Подключите Warcraft Logs, чтобы увидеть свои действия и потери урона в конкретном бою.")}</p></div></header>{oauthResult ? <ConnectionNotice result={oauthResult} connected={false} locale={locale} /> : null}<div className={styles.connect} data-folio-tools><ShieldCheck /><div><b>{t("Нужен доступ к вашим отчётам")}</b><span>{t("Вы сами выбираете отчёт. Gildra не публикует и не меняет ваши логи.")}</span></div><a href={`/api/wow/logs/connect?returnTo=${encodeURIComponent(returnTo)}`}><Link2 />{t("Подключить Warcraft Logs")}</a></div></section>;
  }

  return <section className={styles.logs} id="audit-logs" aria-labelledby="logs-heading"><WarcraftFrame /><header><span><Activity /></span><div><small>{t("БОЕВОЙ ЖУРНАЛ")}</small><h2 id="logs-heading">{t("Что произошло в бою")}</h2><p>{t("Выберите отчёт и бой. Советы будут привязаны к вашим действиям и времени их применения.")}</p></div><button data-folio-action="quiet" type="button" onClick={() => void disconnect()}><LogOut />{t("Отключить")}</button></header>
    {oauthResult === "connected" ? <ConnectionNotice result="connected" connected locale={locale} /> : null}
    <div className={styles.steps} aria-label={t("Как начать анализ")}><span>1</span><b>{t("Выберите отчёт")}</b><span>2</span><b>{t("Выберите бой")}</b><span>3</span><b>{t("Нажмите «Разобрать бой»")}</b></div>
    {reportsState === "loading" ? <div className={styles.reportState} role="status"><LoaderCircle className={styles.spin} />{t("Загружаем ваши последние отчёты…")}</div> : null}
    {reportsState === "ready" && !reports.length ? <div className={styles.reportState} role="status"><AlertTriangle /><span><b>{t("Доступных отчётов пока нет.")}</b> {t("Вставьте ссылку на публичный отчёт или сначала загрузите бой в Warcraft Logs.")}</span></div> : null}
    {reportsState === "error" ? <div className={styles.reportState} role="alert"><AlertTriangle /><span><b>{t("Список отчётов не загрузился.")}</b> {t("Можно всё равно вставить прямую ссылку на доступный лог.")}</span></div> : null}
    <div className={styles.import} data-folio-fields data-folio-tools>{reports.length ? <label><span>{t("Мои последние отчёты")}</span><select value={extractCode(reportInput)} onChange={(event) => setReportInput(event.target.value)}><option value="">{t("Выберите отчёт…")}</option>{reports.map((item) => <option key={item.code} value={item.code}>{item.title} · {item.zone || workspaceVisibility(locale, item.visibility)} · {new Date(item.startTime).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")}</option>)}</select></label> : null}<label><span>{t("Ссылка или код отчёта")}</span><input value={reportInput} onChange={(event) => setReportInput(event.target.value)} placeholder="https://warcraftlogs.com/reports/AbCdEf1234567890" /></label><button type="button" onClick={() => void loadReport()} disabled={busy === "report"}>{busy === "report" ? <LoaderCircle className={styles.spin} /> : <Search />}{t("Найти отчёт")}</button></div>
    {error ? <div className={styles.error} role="alert"><AlertTriangle />{error}</div> : null}
    {report ? <div className={styles.selector} data-folio-fields data-folio-tools><div><small>{workspaceVisibility(locale, report.report.visibility)} · {report.report.zone || "Warcraft Logs"}</small><b>{report.report.title}</b><span>{report.actor.name} — {report.actor.server}</span></div><label><span>{t("Конкретный бой")}</span><select value={fightID} onChange={(event) => { setFightID(Number(event.target.value)); setAnalysis(null); }}>{report.fights.map((fight) => <option key={fight.id} value={fight.id}>{fight.name} · {fight.specialization} · {Math.round(fight.durationSeconds)} {t("сек.")} · {fight.kill ? t("победа") : t("поражение")}</option>)}</select></label><button type="button" disabled={!fightID || busy === "analysis"} onClick={() => void analyze()}>{busy === "analysis" ? <LoaderCircle className={styles.spin} /> : <Zap />}{t("Разобрать бой")}</button></div> : null}
    {report && !comparisonSimulation ? <div className={styles.hint}><TimerReset />{simulation ? t("Точный расчёт ротации сейчас недоступен. Мы покажем данные боя, но не будем сравнивать DPS и время применения умений с неточным прогнозом.") : t("Сначала рассчитайте ротацию выше — тогда сравним реальный бой с прогнозом для этого персонажа.")}</div> : null}
    {analysis ? <>{analysis.metrics.comparison.status !== "comparable" ? <div className={styles.hint} role="status"><AlertTriangle />{comparisonExplanation(analysis, comparisonSimulation, locale)}</div> : null}<div className={styles.metrics}><Metric label={t("Фактический DPS")} value={number(analysis.metrics.dps, locale)} detail={analysis.metrics.simDeltaPercent === undefined ? t("сравнение пока недоступно") : `${analysis.metrics.simDeltaPercent >= 0 ? "+" : ""}${workspaceNumber(locale, analysis.metrics.simDeltaPercent, 1)}% ${locale === "ru" ? "к расчёту" : "vs simulation"}`} /><Metric label={t("Умений в минуту")} value={`${workspaceNumber(locale, analysis.metrics.castsPerMinute, 1)}`} detail={`${workspaceNumber(locale, analysis.metrics.casts)} ${locale === "ru" ? "применений" : "casts"}`} /><Metric label={t("Время усиления")} value={analysis.metrics.buffUptimePercent === null ? "—" : `${workspaceNumber(locale, analysis.metrics.buffUptimePercent, 1)}%`} detail={analysis.metrics.buffUptimePercent === null ? t("нет данных об усилении") : analysis.metrics.buffName} /><Metric label={t("Задержка сильных умений")} value={analysis.metrics.driftSeconds === null ? "—" : `${workspaceNumber(locale, analysis.metrics.driftSeconds, 1)} ${t("сек.")}`} detail={analysis.metrics.driftSeconds === null ? t("нужен сопоставимый расчёт") : t("относительно расчёта")} /><Metric label={t("Потерянный ресурс")} value={analysis.metrics.overcapPercent === null ? "—" : `${workspaceNumber(locale, analysis.metrics.overcapPercent, 1)}%`} detail={analysis.metrics.overcapPercent === null ? t("нет данных о ресурсе") : t("ресурс накопился сверх предела")} /><Metric label={t("Смерти")} value={String(analysis.metrics.deaths)} detail={analysis.fight.kill ? t("бой завершён") : t("бой не завершён победой")} /></div>
        <div className={styles.findings}><h3>{t("Что исправить — с доказательствами")}</h3>{analysis.findings.map((item) => <article key={item.id} data-severity={item.severity}><span>{item.severity === "high" ? <Skull /> : item.severity === "medium" ? <Clock3 /> : <Check />}</span><div><small>{item.timestampLabel} · {item.evidence}</small><b>{item.title}</b><p>{item.detail}</p></div><a href={item.sourceURL ?? analysis.sourceURL} target="_blank" rel="noreferrer">{t("Открыть момент")} <ExternalLink /></a></article>)}</div>
      <footer><ShieldCheck /><div><b>{t("Советы основаны на выбранном бою Warcraft Logs.")}</b><details className={styles.technical}><summary>{t("Источник и ограничения анализа")}</summary>{t("Отчёт")} {analysis.report.code}{t(", бой #")}{analysis.fight.id}{t(", персонаж #")}{analysis.actor.id}{t(". DPS взят из WCL DamageDone с питомцами; советы построены по событиям умений, усилений, ресурса и смертей. Сравнение с SimulationCraft доступно только для сопоставимого боя по длительности и числу целей. Другие отчёты и персонажи не смешиваются.")}</details></div></footer></> : null}
  </section>;
}

function comparisonExplanation(analysis: WarcraftLogsAnalysis, simulation: RotationSimulationResult | null, locale: WorkspaceLocale) {
  const t = characterWorkspaceCopy(locale);
  const comparison = analysis.metrics.comparison;
  if (comparison.status === "duration_mismatch") return locale === "ru"
    ? `Сравнение урона скрыто: бой длился ${workspaceNumber(locale, analysis.fight.durationSeconds)} сек., а расчёт — ${workspaceNumber(locale, simulation?.fightLengthSeconds ?? 0)} сек. Запустите расчёт с похожей длительностью.`
    : `Damage comparison is hidden: the fight lasted ${workspaceNumber(locale, analysis.fight.durationSeconds)} sec, but the simulation lasted ${workspaceNumber(locale, simulation?.fightLengthSeconds ?? 0)} sec. Run a simulation with a similar duration.`;
  if (comparison.status === "target_mismatch") return locale === "ru"
    ? `Сравнение урона скрыто: в бою было ${comparison.observedTargets} целей, а расчёт сделан для ${comparison.simulatedTargets ?? 0}. Эти числа нельзя честно сравнивать.`
    : `Damage comparison is hidden: the fight had ${comparison.observedTargets} targets, but the simulation used ${comparison.simulatedTargets ?? 0}. These results are not comparable.`;
  if (comparison.status === "death") return t("Сравнение урона и задержки умений скрыто: персонаж погиб до конца боя, поэтому полный расчёт здесь неприменим.");
  if (comparison.status === "dynamic_targets") return locale === "ru"
    ? `Сравнение урона скрыто: в бою были ${comparison.observedTargets} разные цели, но мы не знаем, сколько из них дрались одновременно.`
    : `Damage comparison is hidden: the fight had ${comparison.observedTargets} different targets, but their simultaneous activity is unknown.`;
  return t("Сравнение урона скрыто: сначала рассчитайте ротацию выше для этого персонажа и типа боя.");
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div><small>{label}</small><b>{value}</b><span>{detail}</span></div>; }

function ConnectionNotice({ result, connected, locale }: { result: "connected" | "invalid_state" | "invalid_session" | "exchange_failed"; connected: boolean; locale: WorkspaceLocale }) {
  const t = characterWorkspaceCopy(locale);
  if (result === "connected" && connected) return <div className={styles.success} role="status"><Check /><span><b>{t("Warcraft Logs подключён")}</b>{t("Теперь выберите отчёт ниже или вставьте прямую ссылку на лог.")}</span></div>;
  const text = result === "exchange_failed" ? t("Warcraft Logs не разрешил подключение. Попробуйте ещё раз.") : result === "invalid_state" ? t("Проверка безопасности не прошла. Начните подключение заново.") : t("Сессия Battle.net изменилась. Обновите страницу и подключитесь заново.");
  return <div className={styles.oauthError} role="alert"><AlertTriangle /><span><b>{t("Подключение не завершено")}</b>{text}</span></div>;
}
