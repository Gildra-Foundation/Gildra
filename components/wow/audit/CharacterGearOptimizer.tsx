"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronRight, CircleHelp, Filter, Gem, LoaderCircle, MapPin, PackageCheck, RefreshCw, ShieldCheck, Sparkles, Swords } from "lucide-react";
import type { AuditGearItem } from "@/lib/wow/characterAudit";
import { useCharacterWorkspaceDocument } from "@/lib/wow/useCharacterWorkspaceDocument";
import { recordCharacterRun } from "@/lib/wow/characterRunHistory";
import { WarcraftFrame } from "./WarcraftFrame";
import { characterWorkspaceCopy, workspaceGearError, workspaceKind, workspaceLocale, workspaceNumber, type WorkspaceLocale } from "./characterWorkspaceCopy";
import styles from "./characterGearOptimizer.module.css";

type Variant = { key: string; itemLevel: number; bonusIds: number[] };
type Candidate = {
  entityId: string; itemId: number; name: string; iconUrl?: string; itemLevel: number; slotType: string;
  variants: Variant[]; eligible: boolean;
  source: { type: string; name?: string; location?: string; evidence: "catalog" | "missing" };
  season: { id: string; patch: string; status: "current" | "unknown" | "legacy" };
  constraints: { uniqueEquipped: boolean; crafted: boolean; setName?: string; requiredLevel: number };
  provenance: { build?: string; buildNumber?: number };
};
type CandidatePayload = { candidates?: Candidate[]; rejectedByReason?: Record<string, number>; season?: { id: string; patch: string; build?: string }; error?: string };
type Comparison = {
  baselineDps: number; candidateDps: number; deltaDps: number; deltaPercent: number; confidence: number; iterations: number; engine: string;
  uncertainty: { marginDps: number; marginPercent: number; significant: boolean };
  scenario: { id: string; fightLengthSeconds: number; targets: number };
  error?: string;
};
type SourceFilter = "all" | "raid" | "crafted" | "world";
type Scenario = "single-target" | "aoe" | "execute";

function gearOptions(locale: WorkspaceLocale) {
const t = characterWorkspaceCopy(locale);
const sourceFilters: Array<{ id: SourceFilter; label: string }> = [
  { id: "all", label: t("Все источники") }, { id: "raid", label: t("Рейды") }, { id: "crafted", label: t("Крафт") }, { id: "world", label: t("Мир и торговцы") },
];
const scenarios: Array<{ id: Scenario; label: string; hint: string }> = [
  { id: "single-target", label: t("Одна цель"), hint: t("120 сек.") }, { id: "aoe", label: t("Пачка"), hint: t("5 целей") }, { id: "execute", label: t("Добивание"), hint: t("конец боя") },
];

return { sourceFilters, scenarios };
}

function sourceGroup(source: Candidate["source"]): SourceFilter {
  if (source.type === "encounter") return "raid";
  if (source.type === "crafting_recipe") return "crafted";
  return "world";
}

function sourceLabel(source: Candidate["source"], locale: WorkspaceLocale) {
  const t = characterWorkspaceCopy(locale);
  if (source.type === "crafting_recipe") return source.name ? `${t("Крафт")} · ${source.name}` : t("Профессия");
  if (source.type === "encounter") return [source.location, source.name].filter(Boolean).join(" · ") || t("Босс текущего сезона");
  if (source.type === "vendor") return source.name ? `${t("Торговец")} · ${source.name}` : t("Торговец");
  if (source.type === "quest") return source.name ? `${t("Задание")} · ${source.name}` : t("Задание");
  return source.location || source.name || t("Источник не подтверждён");
}

function resultKey(candidate: Candidate, variant: Variant, scenario: Scenario) { return `${candidate.itemId}:${variant.key}:${scenario}`; }
function formatDps(value: number, locale: WorkspaceLocale) { return workspaceNumber(locale, value); }
function validOwned(value: unknown) { return Array.isArray(value) ? value.filter((item): item is number => Number.isInteger(item) && Number(item) > 0) : []; }
const noOwnedItems: number[] = [];

export function CharacterGearOptimizer({ characterSlug, specializationSlug, gear, snapshotKey, localePrefix = "/ru" }: { characterSlug: string; specializationSlug: string; gear: AuditGearItem[]; snapshotKey: string; localePrefix?: "" | "/ru" }) {
  const locale = workspaceLocale(localePrefix), t = characterWorkspaceCopy(locale);
  const { sourceFilters, scenarios } = gearOptions(locale);
  const slots = useMemo(() => gear.filter((item): item is AuditGearItem & { itemId: number; slotType: string } => Boolean(item.itemId && item.slotType)), [gear]);
  const [slotType, setSlotType] = useState(slots[0]?.slotType ?? "");
  const [payload, setPayload] = useState<CandidatePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [scenario, setScenario] = useState<Scenario>("single-target");
  const [results, setResults] = useState<Record<string, Comparison>>({});
  const [busy, setBusy] = useState<string[]>([]);
  const [reloadNonce, setReloadNonce] = useState(0);
  const storageKey = `gildra:gear-owned:${characterSlug}`;
  const { value: owned, setValue: setOwned, syncState, message: syncMessage } = useCharacterWorkspaceDocument({
    enabled: true, characterSlug, specializationSlug, kind: "gear-owned", localStorageKey: storageKey, initialValue: noOwnedItems, validate: validOwned, lang: locale,
  });
  const current = slots.find((item) => item.slotType === slotType) ?? slots[0];

  useEffect(() => {
    if (!slotType) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError(""); setPayload(null);
    fetch("/api/wow/gear-candidates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterSlug, slotType, locale }), cache: "no-store", signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json() as CandidatePayload;
      if (!response.ok) throw new Error(body.error ?? "catalog_unavailable");
      if (active) setPayload(body);
    }).catch((reason) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      if (active) setError(reason instanceof Error ? reason.message : "catalog_unavailable");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [characterSlug, slotType, snapshotKey, reloadNonce, locale]);

  const verified = useMemo(() => (payload?.candidates ?? []).filter((candidate) => candidate.eligible && candidate.source.evidence === "catalog" && candidate.season.status === "current" && candidate.variants.some((variant) => variant.bonusIds.length)), [payload]);
  const filtered = useMemo(() => verified.filter((candidate) => filter === "all" || sourceGroup(candidate.source) === filter).sort((a, b) => {
    const aVariant = a.variants[0], bVariant = b.variants[0];
    const aResult = aVariant && results[resultKey(a, aVariant, scenario)];
    const bResult = bVariant && results[resultKey(b, bVariant, scenario)];
    return Number(Boolean(bResult)) - Number(Boolean(aResult)) || (bResult?.deltaPercent ?? -Infinity) - (aResult?.deltaPercent ?? -Infinity) || b.itemLevel - a.itemLevel;
  }), [verified, filter, results, scenario]);

  async function simulate(candidate: Candidate) {
    const variant = candidate.variants[0];
    if (!variant) return;
    const key = resultKey(candidate, variant, scenario);
    if (busy.includes(key)) return;
    setBusy((items) => [...items, key]);
    try {
      const response = await fetch("/api/wow/gear-simulation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterSlug, slotType, candidateItemId: candidate.itemId, candidateEntityId: candidate.entityId, variantKey: variant.key, scenario }),
      });
      const result = await response.json() as Comparison;
      if (!response.ok) throw new Error(result.error ?? "simulation_unavailable");
      setResults((items) => ({ ...items, [key]: result }));
      void recordCharacterRun(characterSlug, specializationSlug, {
        kind: "gear",
        gameBuild: String(candidate.provenance.build ?? payload?.season?.build ?? payload?.season?.patch ?? "unknown"),
        profileFingerprint: snapshotKey,
        scenario: { id: result.scenario.id, durationSeconds: result.scenario.fightLengthSeconds, targets: result.scenario.targets },
        engine: result.engine,
        metrics: { baselineDps: result.baselineDps, candidateDps: result.candidateDps, deltaDps: result.deltaDps, deltaPercent: result.deltaPercent, confidence: result.confidence, iterations: result.iterations },
        label: `${workspaceKind(locale, "gear")} · ${candidate.name}`,
      }).catch(() => undefined);
    } catch (reason) {
      setResults((items) => ({ ...items, [key]: { error: reason instanceof Error ? reason.message : "simulation_unavailable" } as Comparison }));
    } finally { setBusy((items) => items.filter((item) => item !== key)); }
  }

  async function simulateVisible() {
    for (const candidate of filtered.slice(0, 6)) await simulate(candidate);
  }

  function toggleOwned(itemId: number) {
    setOwned((items) => {
      const next = items.includes(itemId) ? items.filter((id) => id !== itemId) : [...items, itemId];
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Account sync remains available when local storage is blocked. */ }
      return next;
    });
  }

  if (!slots.length) return null;
  const excluded = Object.values(payload?.rejectedByReason ?? {}).reduce((sum, value) => sum + value, 0);
  return <section className={styles.optimizer} aria-labelledby="gear-optimizer-heading">
    <WarcraftFrame />
    <header className={styles.heading}>
      <span className={styles.headingIcon}><Swords aria-hidden="true" /></span>
      <div><small>{t("ПОДБОР СНАРЯЖЕНИЯ")}</small><h2 id="gear-optimizer-heading">{t("Что надеть вместо текущей вещи?")}</h2><p>{t("Выберите слот и тип боя, затем сравните урон. До расчёта вещь не считается улучшением.")}</p></div>
      <span className={styles.liveBadge}><ShieldCheck /> {t("Ваши данные")}</span>
    </header>

    <div className={styles.controls} data-folio-fields>
      <label><span>{t("Слот экипировки")}</span><select value={slotType} onChange={(event) => setSlotType(event.target.value)}>{slots.map((item) => <option key={item.slotType} value={item.slotType}>{item.slot} · {item.itemLevel}</option>)}</select></label>
      <fieldset><legend>{t("Сценарий расчёта")}</legend><div className={styles.segmented}>{scenarios.map((entry) => <button data-folio-choice key={entry.id} type="button" aria-pressed={scenario === entry.id} onClick={() => setScenario(entry.id)}><b>{entry.label}</b><small>{entry.hint}</small></button>)}</div></fieldset>
      <div className={styles.currentItem}><img src={current?.iconUrl} alt="" /><span><small>{t("Сейчас надето")}</small><b>{current?.name}</b><em>{current?.itemLevel} {t("ур.")}</em></span></div>
    </div>

    <div className={styles.toolbar}>
      <span><Filter aria-hidden="true" /> {t("Доступный контент")}</span>
      <div role="group" aria-label={t("Фильтр источника предметов")}>{sourceFilters.map((entry) => <button data-folio-choice key={entry.id} type="button" aria-pressed={filter === entry.id} onClick={() => setFilter(entry.id)}>{entry.label}</button>)}</div>
      <button className={styles.calculateAll} data-folio-action type="button" onClick={() => void simulateVisible()} disabled={loading || !filtered.length || busy.length > 0}>{busy.length ? <LoaderCircle className={styles.spin} /> : <Sparkles />} {busy.length ? `${t("Считаем…")} ${workspaceNumber(locale, busy.length)}` : t("Сравнить до 6 вещей")}</button>
    </div>

    {loading ? <div className={styles.state} role="status" aria-live="polite"><LoaderCircle className={styles.spin} /><b>{t("Ищем подходящие предметы")}</b><span>{t("Проверяем слот, класс, сезон и источник добычи.")}</span></div> : null}
    {!loading && error ? <div className={styles.state} role="alert"><AlertTriangle /><b>{t("Не удалось загрузить предметы")}</b><span>{t("Пока каталог недоступен, мы не будем советовать замену наугад.")}</span><details className={styles.technical}><summary>{t("Подробности ошибки")}</summary>{workspaceGearError(locale, error)} · {error}</details><button data-folio-action="quiet" type="button" onClick={() => setReloadNonce((value) => value + 1)}><RefreshCw />{t("Повторить")}</button></div> : null}
    {!loading && !error && !filtered.length ? <div className={styles.state} role="status"><CircleHelp /><b>{t("Подходящих замен пока нет")}</b><span>{t("Попробуйте другой слот или источник предметов. Без проверенных данных мы не показываем рекомендацию.")}</span></div> : null}

    {!loading && !error && filtered.length ? <ol className={styles.candidates} aria-live="polite">{filtered.slice(0, 12).map((candidate, index) => {
      const variant = candidate.variants[0];
      const key = resultKey(candidate, variant, scenario);
      const result = results[key];
      const pending = busy.includes(key);
      const recommendation = result && !result.error && result.deltaDps > 0 && result.uncertainty.significant;
      const uncertain = result && !result.error && result.deltaDps > 0 && !result.uncertainty.significant;
      const hasItem = owned.includes(candidate.itemId);
      return <li key={`${candidate.entityId}:${variant.key}`} data-recommendation={recommendation || undefined}>
        <span className={styles.rank}>{result ? index + 1 : "—"}</span>
        <div className={styles.itemPair}><span><small>{t("Сейчас")}</small><img src={current?.iconUrl} alt="" /><b>{current?.name}</b><em>{current?.itemLevel}</em></span><ChevronRight /><span><small>{t("Кандидат")}</small><img src={candidate.iconUrl || "/assets/wow/icon-unverified.svg"} alt="" /><b>{candidate.name}</b><em>{variant.itemLevel}</em></span></div>
        <div className={styles.source}><small><MapPin />{t("Где получить")}</small><b>{sourceLabel(candidate.source, locale)}</b><details className={styles.technical}><summary>{t("Данные предмета")}</summary>{t("Обновление")} {candidate.season.patch} {t("· сборка")} {candidate.provenance.build ?? candidate.provenance.buildNumber ?? t("подтверждена каталогом")}</details></div>
        <div className={styles.constraints}><small>{t("Ограничения")}</small>{candidate.constraints.uniqueEquipped ? <span>{t("Уникальный")}</span> : null}{candidate.constraints.crafted ? <span>{t("Крафт")}</span> : null}{candidate.constraints.setName ? <span>{t("Комплект:")} {candidate.constraints.setName}</span> : null}{!candidate.constraints.uniqueEquipped && !candidate.constraints.crafted && !candidate.constraints.setName ? <span>{t("Особых нет")}</span> : null}</div>
        <div className={styles.result}>
          {!result && !pending ? <><small>{t("Урон ещё не сравнивали")}</small><b>{t("Не проверено")}</b><span>{t("Нажмите «Сравнить DPS»")}</span></> : null}
          {pending ? <><LoaderCircle className={styles.spin} /><b>{t("Считаем…")}</b><span>{t("Тот же персонаж и билд")}</span></> : null}
          {result?.error ? <><AlertTriangle /><b>{t("Расчёт отклонён")}</b><span>{workspaceGearError(locale, result.error)}</span><details className={styles.technical}><summary>{t("Подробности ошибки")}</summary>{result.error}</details></> : null}
          {result && !result.error ? <><small>{formatDps(result.baselineDps, locale)} → {formatDps(result.candidateDps, locale)} DPS</small><b data-positive={recommendation || undefined}>{result.deltaDps >= 0 ? "+" : ""}{formatDps(result.deltaDps, locale)} · {result.deltaPercent >= 0 ? "+" : ""}{workspaceNumber(locale, result.deltaPercent, 2)}%</b><span>{recommendation ? t("Улучшение выше погрешности") : uncertain ? t("Возможный прирост не доказан") : t("Этот вариант слабее — не рекомендуем")}</span><details className={styles.technical}><summary>{t("Точность расчёта")}</summary>{t("Погрешность ±")}{workspaceNumber(locale, result.uncertainty.marginPercent, 2)}{t("% · уверенность")} {result.confidence}% · {workspaceNumber(locale, result.iterations)} {t("прогонов")}</details></> : null}
        </div>
        <div className={styles.actions} data-folio-tools><button type="button" onClick={() => void simulate(candidate)} disabled={pending}>{pending ? <LoaderCircle className={styles.spin} /> : <Swords />}{result ? t("Пересчитать") : t("Сравнить DPS")}</button><button type="button" aria-pressed={hasItem} onClick={() => toggleOwned(candidate.itemId)}><PackageCheck />{hasItem ? t("Уже получен") : t("Отметить полученным")}</button></div>
      </li>;
    })}</ol> : null}
    <footer><Gem /><div><b>{t("Показываем только проверенные предметы.")}</b> {t("Отсутствующий источник или неподходящий сезон исключают вещь из списка.")}{syncMessage ? ` ${syncMessage}` : ""}<details className={styles.technical}><summary>{t("Как отбираются варианты")}</summary>{t("Нужны источник получения, текущий сезон и игровые варианты предмета.")} {excluded ? locale === "ru" ? `${workspaceNumber(locale, excluded)} вариантов исключено проверками.` : `${workspaceNumber(locale, excluded)} variants excluded by checks.` : t("Измеренный прирост показывается только после сравнения урона.")}</details></div><em>{syncState === "saving" ? t("Сохраняем…") : syncState === "synced" ? t("Аккаунт синхронизирован") : ""}</em></footer>
  </section>;
}
