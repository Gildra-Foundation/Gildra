"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clock3, ExternalLink, Link2, LoaderCircle, LogOut, Search, ShieldCheck, Skull, Zap } from "lucide-react";
import { MaterialButton, MaterialLinkButton } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import type { RotationAbility, RotationSimulationResult } from "@/lib/platform/rotation/types";
import type { WarcraftLogsAnalysis } from "@/lib/wow/warcraftLogsAnalysis";
import { characterLogsReturnTo } from "@/lib/wow/warcraftLogsRoutes";
import { characterWorkspaceCopy, workspaceLocale, workspaceNumber, workspaceVisibility, type WorkspaceLocale } from "./characterWorkspaceCopy";
import styles from "./characterLogAnalysis.module.css";
import tools from "./characterTools.module.css";

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
    const controller = new AbortController();
    fetch("/api/wow/logs/status", { cache: "no-store", signal: controller.signal }).then(async (response) => setStatus(await response.json() as Status)).catch(() => {
      if (!controller.signal.aborted) setStatus({ configured: false, connected: false, error: "unavailable" });
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!status?.connected) return;
    setReportsState("loading");
    const controller = new AbortController();
    fetch("/api/wow/logs/reports", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (response.status === 401 || response.status === 403) { setStatus((value) => ({ configured: value?.configured ?? true, connected: false })); setReportsState("error"); return; }
      if (!response.ok) { setReportsState("error"); return; }
      const payload = await response.json() as { reports?: ReportOption[] };
      setReports(payload.reports ?? []);
      setReportsState("ready");
    }).catch(() => { if (!controller.signal.aborted) setReportsState("error"); });
    return () => controller.abort();
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

  if (!status) return <section className={`${tools.tool} ${styles.logs}`} id="audit-logs" aria-busy="true"><p className={tools.status}><LoaderCircle className={tools.spin} aria-hidden="true" />{t("Проверяем Warcraft Logs…")}</p></section>;
  if (!status.configured) return <section className={`${tools.tool} ${styles.logs}`} id="audit-logs"><p className={tools.status}><ShieldCheck aria-hidden="true" />{t("Разбор боёв пока недоступен")}</p></section>;
  if (!status.connected) {
    const returnTo = characterLogsReturnTo(localePrefix, characterSlug);
    return <section className={`${tools.tool} ${styles.logs}`} id="audit-logs">
      {oauthResult ? <ConnectionNotice result={oauthResult} connected={false} locale={locale} /> : null}
      <div className={tools.head}><p className={styles.lead}>{t("Подключите Warcraft Logs, чтобы разобрать свой бой.")}</p><MaterialLinkButton kit={CHARACTERS_KIT} fit="stack" variant="primary" href={`/api/wow/logs/connect?returnTo=${encodeURIComponent(returnTo)}`} icon={<Link2 aria-hidden="true" />}>{t("Подключить Warcraft Logs")}</MaterialLinkButton></div>
    </section>;
  }

  return <section className={`${tools.tool} ${styles.logs}`} id="audit-logs" aria-label="Warcraft Logs">
    {oauthResult === "connected" ? <ConnectionNotice result="connected" connected locale={locale} /> : null}
    <div className={tools.fields}>
      {reports.length ? <label className={tools.field}>{t("Мои последние отчёты")}<select value={extractCode(reportInput)} onChange={(event) => setReportInput(event.target.value)}><option value="">{t("Выберите отчёт…")}</option>{reports.map((item) => <option key={item.code} value={item.code}>{item.title} · {item.zone || workspaceVisibility(locale, item.visibility)} · {new Date(item.startTime).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")}</option>)}</select></label> : null}
      <label className={tools.field}>{t("Ссылка или код отчёта")}<input value={reportInput} onChange={(event) => setReportInput(event.target.value)} placeholder="warcraftlogs.com/reports/…" /></label>
      <MaterialButton kit={CHARACTERS_KIT} fit="stack" variant={report ? "secondary" : "primary"} type="button" onClick={() => void loadReport()} disabled={busy === "report"} icon={busy === "report" ? <LoaderCircle className={tools.spin} aria-hidden="true" /> : <Search aria-hidden="true" />}>{t("Найти отчёт")}</MaterialButton>
    </div>
    {reportsState === "loading" ? <p className={tools.status} role="status"><LoaderCircle className={tools.spin} aria-hidden="true" />{t("Загружаем ваши последние отчёты…")}</p> : null}
    {reportsState === "error" ? <p className={tools.alert} role="alert"><AlertTriangle aria-hidden="true" />{t("Список отчётов не загрузился.")}</p> : null}
    {error ? <p className={tools.alert} role="alert"><AlertTriangle aria-hidden="true" />{error}</p> : null}
    {report ? <div className={styles.selector}>
      <div className={styles.reportName}><b>{report.report.title}</b><span>{report.actor.name} — {report.actor.server}</span></div>
      <div className={tools.fields}>
        <label className={tools.field}>{t("Бой")}<select value={fightID} onChange={(event) => { setFightID(Number(event.target.value)); setAnalysis(null); }}>{report.fights.map((fight) => <option key={fight.id} value={fight.id}>{fight.name} · {Math.round(fight.durationSeconds)} {t("сек.")} · {fight.kill ? t("победа") : t("поражение")}</option>)}</select></label>
        <MaterialButton kit={CHARACTERS_KIT} fit="stack" variant="primary" type="button" disabled={!fightID || busy === "analysis"} onClick={() => void analyze()} icon={busy === "analysis" ? <LoaderCircle className={tools.spin} aria-hidden="true" /> : <Zap aria-hidden="true" />}>{t("Разобрать бой")}</MaterialButton>
      </div>
    </div> : null}
    {analysis ? <>
      <div className={styles.metrics}>
        <Metric label={t("Фактический DPS")} value={number(analysis.metrics.dps, locale)} detail={analysis.metrics.simDeltaPercent === undefined ? "" : `${analysis.metrics.simDeltaPercent >= 0 ? "+" : ""}${workspaceNumber(locale, analysis.metrics.simDeltaPercent, 1)}%`} />
        <Metric label={t("Умений в минуту")} value={workspaceNumber(locale, analysis.metrics.castsPerMinute, 1)} detail="" />
        <Metric label={t("Время усиления")} value={analysis.metrics.buffUptimePercent === null ? "—" : `${workspaceNumber(locale, analysis.metrics.buffUptimePercent, 1)}%`} detail={analysis.metrics.buffUptimePercent === null ? "" : analysis.metrics.buffName} />
        {analysis.metrics.driftSeconds !== null ? <Metric label={t("Задержка сильных умений")} value={`${workspaceNumber(locale, analysis.metrics.driftSeconds, 1)} ${t("сек.")}`} detail="" /> : null}
        <Metric label={t("Потерянный ресурс")} value={analysis.metrics.overcapPercent === null ? "—" : `${workspaceNumber(locale, analysis.metrics.overcapPercent, 1)}%`} detail="" />
        <Metric label={t("Смерти")} value={String(analysis.metrics.deaths)} detail="" />
      </div>
      {analysis.findings.length ? <div className={styles.findings}><h3 className={tools.subtitle}>{t("Что исправить")}</h3>{analysis.findings.map((item) => <article key={item.id} data-severity={item.severity}><span aria-hidden="true">{item.severity === "high" ? <Skull /> : item.severity === "medium" ? <Clock3 /> : <Check />}</span><div><small>{item.timestampLabel}</small><b>{item.title}</b><p>{item.detail}</p></div><a className={tools.quiet} href={item.sourceURL ?? analysis.sourceURL} target="_blank" rel="noreferrer">{t("Открыть момент")} <ExternalLink aria-hidden="true" /></a></article>)}</div> : null}
    </> : null}
    <button className={`${tools.quiet} ${styles.disconnect}`} type="button" onClick={() => void disconnect()}><LogOut aria-hidden="true" />{t("Отключить")}</button>
  </section>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div><small>{label}</small><b>{value}</b>{detail ? <span>{detail}</span> : null}</div>; }

function ConnectionNotice({ result, connected, locale }: { result: "connected" | "invalid_state" | "invalid_session" | "exchange_failed"; connected: boolean; locale: WorkspaceLocale }) {
  const t = characterWorkspaceCopy(locale);
  if (result === "connected" && connected) return <p className={tools.status} role="status"><Check aria-hidden="true" />{t("Warcraft Logs подключён")}</p>;
  const text = result === "exchange_failed" ? t("Warcraft Logs не разрешил подключение. Попробуйте ещё раз.") : result === "invalid_state" ? t("Проверка безопасности не прошла. Начните подключение заново.") : t("Сессия Battle.net изменилась. Обновите страницу и подключитесь заново.");
  return <p className={tools.alert} role="alert"><AlertTriangle aria-hidden="true" />{text}</p>;
}
