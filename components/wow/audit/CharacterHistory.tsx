"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Clock3, Copy, History, Link2, LoaderCircle, RefreshCw, Shield, ShieldCheck, Sparkles, Swords, Unlink } from "lucide-react";
import type { CharacterRunRecord } from "@/lib/wow/characterRunHistory";
import { WarcraftFrame } from "./WarcraftFrame";
import { BookEngraving } from "./BookEngraving";
import { characterWorkspaceCopy, workspaceLocale, workspaceNumber, workspaceRunLabel, type WorkspaceLocale } from "./characterWorkspaceCopy";
import styles from "./characterHistory.module.css";

function formatNumber(value: number, locale: WorkspaceLocale) { return workspaceNumber(locale, value); }

function metric(record: CharacterRunRecord, locale: WorkspaceLocale) {
  const t = characterWorkspaceCopy(locale);
  if (record.metrics.dps !== undefined) return `${formatNumber(record.metrics.dps, locale)} DPS`;
  if (record.metrics.candidateDps !== undefined) return `${formatNumber(record.metrics.candidateDps, locale)} DPS`;
  if (record.metrics.aoeDps !== undefined) return `${formatNumber(record.metrics.aoeDps, locale)} ${locale === "ru" ? "DPS по пачке" : "AoE DPS"}`;
  return t("Результат сохранён");
}

export function CharacterHistory({ characterSlug, specializationSlug, fingerprint, localePrefix }: { characterSlug: string; specializationSlug: string; fingerprint: string; localePrefix: "" | "/ru" }) {
  const locale = workspaceLocale(localePrefix), t = characterWorkspaceCopy(locale);
  const [runs, setRuns] = useState<CharacterRunRecord[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const query = new URLSearchParams({ character: characterSlug, specialization: specializationSlug, fingerprint }).toString();

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch(`/api/wow/workspace/history?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("history_unavailable");
      const payload = await response.json() as { runs?: CharacterRunRecord[] };
      setRuns(payload.runs ?? []);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ characterSlug?: string; specializationSlug?: string }>).detail;
      if (detail?.characterSlug === characterSlug && detail?.specializationSlug === specializationSlug) void load();
    };
    window.addEventListener("gildra:character-history-updated", update);
    return () => window.removeEventListener("gildra:character-history-updated", update);
  }, [characterSlug, load, specializationSlug]);

  async function share(run: CharacterRunRecord) {
    setBusy(run.id); setNotice("");
    try {
      const response = await fetch(`/api/wow/workspace/history/${run.id}/share?${query}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload = await response.json() as { id?: string; token?: string };
      if (!response.ok || !payload.id || !payload.token) throw new Error("share_unavailable");
      const url = `${window.location.origin}${localePrefix}/wow/shared/${payload.token}`;
      await navigator.clipboard.writeText(url);
      setRuns((items) => items.map((item) => item.id === run.id ? { ...item, activeShareId: payload.id } : item));
      setNotice(t("Ссылка скопирована. Данные аккаунта и полный профиль персонажа в неё не входят."));
    } catch {
      setNotice(t("Не удалось создать или скопировать ссылку."));
    } finally { setBusy(""); }
  }

  async function revoke(run: CharacterRunRecord) {
    if (!run.activeShareId) return;
    setBusy(run.id); setNotice("");
    try {
      const response = await fetch(`/api/wow/workspace/shares/${run.activeShareId}?${query}`, { method: "DELETE" });
      if (!response.ok) throw new Error("revoke_failed");
      setRuns((items) => items.map((item) => item.id === run.id ? { ...item, activeShareId: undefined } : item));
      setNotice(t("Ссылка отозвана. По старому адресу результат больше не откроется."));
    } catch { setNotice(t("Не удалось отозвать ссылку.")); }
    finally { setBusy(""); }
  }

  return <section className={styles.history} id="audit-history" aria-labelledby="character-history-heading">
    <WarcraftFrame />
    <header>
      <div className={styles.heading}>
        <span className={styles.icon} aria-hidden="true"><History /></span>
        <div><small>{t("БОЕВОЙ АРХИВ")}</small><h2 id="character-history-heading">{t("Сохранённые расчёты")}</h2><p>{t("Здесь остаются результаты для вашего персонажа. Если экипировка или таланты изменятся, мы пометим старые результаты.")}</p></div>
      </div>
      <div className={styles.archiveTools}>
        <BookEngraving motif="logs" className={styles.archiveEngraving} />
        {state === "ready" || runs.length ? <span className={styles.archiveCount}><small>{t("Сохранено")}</small><strong>{runs.length}</strong><small>{t("в этой истории")}</small></span> : null}
        <button data-folio-action="quiet" data-folio-icon type="button" onClick={() => void load()} disabled={state === "loading"} aria-label={t("Обновить историю")} title={t("Обновить историю")} aria-busy={state === "loading"}><RefreshCw className={state === "loading" ? styles.spin : undefined} aria-hidden="true" /></button>
      </div>
    </header>
    {notice ? <div className={styles.notice} role="status"><Check />{notice}</div> : null}
    {state === "loading" && !runs.length ? <div className={styles.empty} role="status"><LoaderCircle className={styles.spin} />{t("Загружаем историю…")}</div> : null}
    {state === "error" ? <div className={styles.empty}><AlertTriangle />{t("История временно недоступна.")}<button data-folio-action="quiet" type="button" onClick={() => void load()}>{t("Повторить")}</button></div> : null}
    {state === "ready" && !runs.length ? <div className={styles.empty}><Clock3 /><b>{t("Здесь пока пусто")}</b><span>{t("Измените талант, рассчитайте ротацию или сравните предмет — результат появится здесь автоматически.")}</span></div> : null}
    {runs.length ? <ol>{runs.map((run) => <li key={run.id} data-stale={run.stale || undefined} data-book-record data-book-reveal="ink">
      <span className={styles.kind}>{run.kind === "talent" ? <Sparkles aria-hidden="true" /> : run.kind === "rotation" ? <Swords aria-hidden="true" /> : <Shield aria-hidden="true" />}{run.kind === "talent" ? t("Таланты") : run.kind === "rotation" ? t("Ротация") : t("Экипировка")}</span>
      <div className={styles.summary}><b>{workspaceRunLabel(locale, run)}</b><strong>{metric(run, locale)}</strong>{run.metrics.deltaPercent !== undefined ? <small>{`${run.metrics.deltaPercent >= 0 ? "+" : ""}${workspaceNumber(locale, run.metrics.deltaPercent, 2)}%`}</small> : null}</div>
      <div className={styles.provenance}><span>{run.scenario.targets} {t("цел.")} · {run.scenario.durationSeconds} {t("сек.")}</span><time dateTime={run.createdAt}>{new Date(run.createdAt).toLocaleString(localePrefix === "/ru" ? "ru-RU" : "en-US")}</time><details className={styles.technical}><summary>{t("Данные расчёта")}</summary><span><ShieldCheck />{run.engine}</span><span>{t("Версия игры:")} {run.gameBuild}</span></details></div>
      <div className={styles.recordFooter}>
        <div className={styles.freshness} data-book-status={run.stale ? "stale" : "current"}>{run.stale ? <><AlertTriangle /><b>{t("Устарел")}</b><small>{t("Профиль изменился — пересчитайте")}</small></> : <><Check /><b>{t("Актуален")}</b><small>{t("Совпадает с текущим профилем")}</small></>}</div>
        <div className={styles.actions} data-folio-tools>{run.activeShareId ? <button type="button" onClick={() => void revoke(run)} disabled={busy === run.id}>{busy === run.id ? <LoaderCircle className={styles.spin} /> : <Unlink />}{t("Отозвать")}</button> : <button type="button" onClick={() => void share(run)} disabled={busy === run.id}>{busy === run.id ? <LoaderCircle className={styles.spin} /> : <Copy />}{t("Поделиться")}</button>}<span><Link2 />{t("Только результат")}</span></div>
      </div>
    </li>)}</ol> : null}
  </section>;
}
