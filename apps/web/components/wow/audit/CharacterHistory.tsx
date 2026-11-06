"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Link2, LoaderCircle, Shield, Sparkles, Swords, Unlink } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { copyText } from "@gildra/atlas-ui/clipboard";
import { MaterialButton } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import type { CharacterRunKind, CharacterRunRecord } from "@/lib/wow/characterRunHistory";
import { characterWorkspaceCopy, workspaceKind, workspaceLocale, workspaceNumber, workspaceRunLabel, workspaceScenarioSize, type WorkspaceLocale } from "./characterWorkspaceCopy";
import styles from "./characterHistory.module.css";

const kindOrder: CharacterRunKind[] = ["talent", "rotation", "gear"];
const kindIcon = { talent: Sparkles, rotation: Swords, gear: Shield } as const;
type Feedback = { id: string; tone: "done" | "error"; text: string };

/** The run's headline number and its change; AoE runs report their own pair. */
function result(run: CharacterRunRecord) {
  const { dps, candidateDps, aoeDps, deltaPercent, aoeDeltaPercent } = run.metrics;
  if (dps !== undefined || candidateDps !== undefined) return { dps: (dps ?? candidateDps) as number, aoe: false, delta: deltaPercent };
  if (aoeDps !== undefined) return { dps: aoeDps, aoe: true, delta: aoeDeltaPercent ?? deltaPercent };
  return null;
}

function formatDelta(locale: WorkspaceLocale, value: number) {
  const size = Math.abs(value);
  const text = workspaceNumber(locale, size, size < 1 ? 2 : 1);
  return value > 0 ? `+${text}%` : value < 0 ? `−${text}%` : `${text}%`;
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

function dayLabel(date: Date, locale: WorkspaceLocale, t: ReturnType<typeof characterWorkspaceCopy>) {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return t("Сегодня");
  if (dayKey(date) === dayKey(yesterday)) return t("Вчера");
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", {
    day: "numeric", month: "long", ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}

/** Saved talent, rotation and gear results of one character, newest first, grouped by day. */
export function CharacterHistory({ characterSlug, specializationSlug, fingerprint, localePrefix }: { characterSlug: string; specializationSlug: string; fingerprint: string; localePrefix: "" | "/ru" }) {
  const locale = workspaceLocale(localePrefix), t = characterWorkspaceCopy(locale);
  const [runs, setRuns] = useState<CharacterRunRecord[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [kind, setKind] = useState<"all" | CharacterRunKind>("all");
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const feedbackTimer = useRef<number | undefined>(undefined);
  const query = new URLSearchParams({ character: characterSlug, specialization: specializationSlug, fingerprint }).toString();

  // One history request at a time: a newer load (another character, a saved
  // run) aborts the previous one, so a slow stale response cannot overwrite it.
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState("loading");
    try {
      const response = await fetch(`/api/wow/workspace/history?${query}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("history_unavailable");
      const payload = await response.json() as { runs?: CharacterRunRecord[] };
      if (controller.signal.aborted) return;
      setRuns(payload.runs ?? []);
      setState("ready");
    } catch {
      if (!controller.signal.aborted) setState("error");
    }
  }, [query]);

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ characterSlug?: string; specializationSlug?: string }>).detail;
      if (detail?.characterSlug === characterSlug && detail?.specializationSlug === specializationSlug) void load();
    };
    window.addEventListener("gildra:character-history-updated", update);
    return () => window.removeEventListener("gildra:character-history-updated", update);
  }, [characterSlug, load, specializationSlug]);
  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);

  const flash = (next: Feedback) => {
    window.clearTimeout(feedbackTimer.current);
    setFeedback(next);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 2600);
  };

  async function share(run: CharacterRunRecord) {
    setBusy(run.id); setFeedback(null);
    try {
      const response = await fetch(`/api/wow/workspace/history/${run.id}/share?${query}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload = await response.json() as { id?: string; token?: string };
      if (!response.ok || !payload.id || !payload.token) throw new Error("share_unavailable");
      await copyText(`${window.location.origin}${localePrefix}/wow/shared/${payload.token}`);
      setRuns((items) => items.map((item) => item.id === run.id ? { ...item, activeShareId: payload.id } : item));
      flash({ id: run.id, tone: "done", text: t("Ссылка скопирована") });
    } catch {
      flash({ id: run.id, tone: "error", text: t("Не удалось скопировать") });
    } finally { setBusy(""); }
  }

  async function revoke(run: CharacterRunRecord) {
    if (!run.activeShareId) return;
    setBusy(run.id); setFeedback(null);
    try {
      const response = await fetch(`/api/wow/workspace/shares/${run.activeShareId}?${query}`, { method: "DELETE" });
      if (!response.ok) throw new Error("revoke_failed");
      setRuns((items) => items.map((item) => item.id === run.id ? { ...item, activeShareId: undefined } : item));
      flash({ id: run.id, tone: "done", text: t("Ссылка отозвана") });
    } catch {
      flash({ id: run.id, tone: "error", text: t("Не удалось отозвать") });
    } finally { setBusy(""); }
  }

  const sorted = useMemo(() => [...runs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [runs]);
  const kinds = useMemo(() => kindOrder.filter((value) => sorted.some((run) => run.kind === value)), [sorted]);
  const activeKind = kind !== "all" && kinds.includes(kind) && kinds.length > 1 ? kind : "all";
  const days = useMemo(() => {
    const groups: { key: string; date: Date; runs: CharacterRunRecord[] }[] = [];
    for (const run of sorted) {
      if (activeKind !== "all" && run.kind !== activeKind) continue;
      const date = new Date(run.createdAt), key = dayKey(date);
      const group = groups.at(-1);
      if (group?.key === key) group.runs.push(run);
      else groups.push({ key, date, runs: [run] });
    }
    return groups;
  }, [activeKind, sorted]);
  const time = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { hour: "2-digit", minute: "2-digit" });

  const row = (run: CharacterRunRecord) => {
    const Icon = kindIcon[run.kind];
    const value = result(run);
    const note = feedback?.id === run.id ? feedback : null;
    return <li key={run.id} className={styles.run} data-stale={run.stale || undefined}>
      <time className={styles.time} dateTime={run.createdAt}>{time.format(new Date(run.createdAt))}</time>
      <span className={styles.kind} data-kind={run.kind} title={workspaceKind(locale, run.kind)}><Icon aria-hidden="true" /></span>
      <div className={styles.body}>
        <p className={styles.label}>
          <span className={styles.srOnly}>{workspaceKind(locale, run.kind)}: </span>
          {workspaceRunLabel(locale, run)}
          {run.stale ? <span className={styles.stale} title={t("Профиль изменился — пересчитайте")}>{t("Устарел")}</span> : null}
        </p>
        <p className={styles.scenario}>{workspaceScenarioSize(locale, run.scenario.targets, run.scenario.durationSeconds)}</p>
      </div>
      <div className={styles.result}>
        {value ? <>
          <strong>{workspaceNumber(locale, value.dps)} <small>{value.aoe ? t("DPS по пачке") : "DPS"}</small></strong>
          {value.delta !== undefined ? <span className={styles.delta} data-sign={value.delta > 0 ? "up" : value.delta < 0 ? "down" : "flat"}>{formatDelta(locale, value.delta)}</span> : null}
        </> : null}
      </div>
      <div className={styles.action}>
        {note
          ? <span className={styles.feedback} data-tone={note.tone} role="status">{note.tone === "done" ? <Check aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}{note.text}</span>
          : run.activeShareId
            ? <AtlasButton variant="ghost" size="sm" className={styles.share} data-shared onClick={() => void revoke(run)} disabled={busy === run.id} aria-busy={busy === run.id}
              icon={busy === run.id ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Unlink aria-hidden="true" />}>{t("Отозвать ссылку")}</AtlasButton>
            : <AtlasButton variant="ghost" size="sm" className={styles.share} onClick={() => void share(run)} disabled={busy === run.id} aria-busy={busy === run.id}
              icon={busy === run.id ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Link2 aria-hidden="true" />}>{t("Поделиться")}</AtlasButton>}
      </div>
    </li>;
  };

  return <section className={styles.history} id="audit-history" aria-label={t("Сохранённые расчёты")} aria-busy={state === "loading"}>
    {state === "loading" && !runs.length ? <div className={styles.skeleton} role="status">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className={styles.ghostRow} aria-hidden="true"><span /><span /><span /><span /></div>)}
      <span className={styles.srOnly}>{t("Загружаем историю…")}</span>
    </div> : null}

    {state === "error" ? <div className={styles.state} role="alert">
      <p><AlertTriangle aria-hidden="true" />{t("История не загрузилась")}</p>
      <MaterialButton kit={CHARACTERS_KIT} onClick={() => void load()}>{t("Повторить")}</MaterialButton>
    </div> : null}

    {state === "ready" && !runs.length ? <div className={styles.state}>
      <p>{t("Здесь появятся ваши расчёты талантов, ротации и экипировки")}</p>
      <MaterialButton kit={CHARACTERS_KIT} icon={<Sparkles aria-hidden="true" />} onClick={() => { window.location.hash = "#talents"; }}>{t("Открыть таланты")}</MaterialButton>
    </div> : null}

    {state !== "error" && runs.length ? <div className={styles.list}>
      {kinds.length > 1 ? <AtlasSegmented className={styles.filter} size="sm" aria-label={t("Тип расчёта")} value={activeKind} onValueChange={(value) => setKind(value as typeof kind)}
        options={[{ value: "all", label: t("Все") }, ...kinds.map((value) => ({ value, label: workspaceKind(locale, value) }))]} /> : null}
      {days.map((day) => <section key={day.key} className={styles.day} aria-label={dayLabel(day.date, locale, t)}>
        <h3>{dayLabel(day.date, locale, t)}</h3>
        <ol>{day.runs.map(row)}</ol>
      </section>)}
    </div> : null}
  </section>;
}
