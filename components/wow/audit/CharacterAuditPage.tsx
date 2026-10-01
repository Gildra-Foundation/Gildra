"use client";

import { type CSSProperties, type ReactNode, createContext, useContext, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChartNoAxesColumnIncreasing,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Crosshair,
  Flame,
  Gauge,
  RefreshCw,
  RotateCcw,
  Share2,
  Shield,
  ShieldCheck,
  Sparkles,
  Settings2,
  Trophy,
  Users,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import {
  type AuditGearItem,
  type AuditGearQuality,
  type CharacterAuditSnapshot,
} from "@/lib/wow/characterAudit";
import { defaultTalentSpecTheme, getTalentSpecTheme } from "@/lib/talentSpecThemes";
import {
  getTestCharacterTalentAudit,
  talentScenarios,
  type CharacterAuditIssue,
  type CharacterTalentAuditProfile,
  type CharacterTalentNode,
  type TalentScenarioId,
} from "@/lib/wow/testCharacterTalentAudit";
import { SpecSignatureFx } from "@/components/talents/spec-signature/SpecSignatureFx";
import { DeferredMount } from "./DeferredMount";
import { WarcraftFrame } from "./WarcraftFrame";
import { CharacterBookBackdrop } from "./CharacterBookBackdrop";
import { CharacterBookNavigation } from "./CharacterBookNavigation";
import { CharacterBookMasthead } from "@/components/wow/characters/CharacterBookMasthead";
import { CharacterBookChapter as CharacterChapter } from "./CharacterBookChapter";
import { BookEngraving } from "./BookEngraving";
import { useCharacterBookReveals } from "./useCharacterBookReveals";
import { PhysicalBookFrame, physicalBookMaterials } from "./PhysicalBookFrame";
import surface from "./characterBookSurface.module.css";
const CharacterTalentSimulator = dynamic(() => import("./CharacterTalentSimulator").then((module) => module.CharacterTalentSimulator));
const CharacterGearOptimizer = dynamic(() => import("./CharacterGearOptimizer").then((module) => module.CharacterGearOptimizer));
const CharacterHistory = dynamic(() => import("./CharacterHistory").then((module) => module.CharacterHistory));
const CharacterLogAnalysis = dynamic(() => import("./CharacterLogAnalysis").then((module) => module.CharacterLogAnalysis));
const RotationLabPage = dynamic(() => import("@/components/platform/rotation/RotationLabPage").then((module) => module.RotationLabPage));
import type { TalentCalculatorData } from "@/lib/talentCalculatorData";
import type { RotationPreset, RotationSimulationResult } from "@/lib/platform/rotation/types";
import { buildRotationSpellbook } from "@/lib/platform/rotation/spellbook";
import { abilityIcon, talentAbilityIcon } from "@/lib/games/wow/assets";
import styles from "./characterAuditPage.module.css";
import grimoire from "./grimoireControls.module.css";
import typography from "./grimoireTypography.module.css";
import book from "./bookSpread.module.css";
import motion from "./characterBookMotion.module.css";
import armoryBook from "./characterArmorySpread.module.css";
import illumination from "./characterBookIllumination.module.css";
import type { Lang } from "@/lib/i18n";
import { characterPageText, characterRoleLabel } from "./characterPageCopy";

const CharacterBookTheme = createContext(false);
const CharacterPageLanguage = createContext<Lang>("ru");
const useCharacterText = () => characterPageText(useContext(CharacterPageLanguage));
function ModelLoading() { const tr = useCharacterText(); return <div className={styles.modelLoading}>{tr("Подготавливаем модель…")}</div>; }

const CharacterModelViewer = dynamic(
  () => import("./CharacterModelViewer").then((module) => module.CharacterModelViewer),
  { ssr: false, loading: ModelLoading },
);

const initialHistory = [
  { at: "5 мин назад", date: "17 мая 2025, 14:18", score: 87, delta: "+5" },
  { at: "1 день назад", date: "16 мая 2025, 10:43", score: 82, delta: "+9" },
  { at: "3 дня назад", date: "14 мая 2025, 20:12", score: 73, delta: "—" },
];

const auditStats = (primaryStat: string) => [[primaryStat, "12 842", "100%", false], ["Скорость", "18,6%", "64%", true], ["Крит. удар", "24,1%", "82%", false], ["Искусность", "25,7%", "76%", false], ["Универсальность", "6,2%", "35%", false]] as const;
const gearStateLabels = { optimal: "Оптимально", good: "Хорошо", issue: "Требует исправления", missing: "Не хватает улучшения" } as const;
const leftEquipmentSlots = new Set(["HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "WRIST", "HANDS"]);
const leftEquipmentNames = new Set(["Голова", "Шея", "Плечи", "Спина", "Нагрудник", "Наручи", "Руки"]);
const weaponEquipmentSlots = new Set(["MAIN_HAND", "OFF_HAND", "RANGED"]);
const weaponEquipmentNames = new Set(["Основная рука", "Левая рука", "Дальний бой"]);
function splitEquipment(gear: AuditGearItem[]) {
  const left: AuditGearItem[] = [];
  const right: AuditGearItem[] = [];
  const weapons: AuditGearItem[] = [];
  for (const item of gear) {
    const slotType = item.slotType?.toUpperCase() ?? "";
    if (weaponEquipmentSlots.has(slotType) || weaponEquipmentNames.has(item.slot)) weapons.push(item);
    else if (leftEquipmentSlots.has(slotType) || leftEquipmentNames.has(item.slot)) left.push(item);
    else right.push(item);
  }
  weapons.sort((a, b) => Number((b.slotType ?? b.slot) === "MAIN_HAND" || b.slot === "Основная рука") - Number((a.slotType ?? a.slot) === "MAIN_HAND" || a.slot === "Основная рука"));
  return { left, right, weapons };
}
type CharacterDiagnosticReport = { reportId?: string; status?: "passed" | "failed"; error?: string; message?: string; checks?: Array<{ id: string; label: string; status: "pass" | "fail" | "skip"; detail: string }> };
type CharacterRefreshPayload = { error?: string; reason?: string; snapshot?: CharacterAuditSnapshot; fingerprint?: string; refreshedAt?: string };
type CharacterRefreshState = { status: "idle" | "success" | "error"; code?: string; message?: string; retryAfter?: number };

export function CharacterAuditPage({ initialSnapshot, initialFingerprint, localePrefix, dataMode, talentData = null, rotationPreset = null }: { initialSnapshot: CharacterAuditSnapshot; initialFingerprint?: string; localePrefix: "" | "/ru"; dataMode: "fixture" | "battle-net"; talentData?: TalentCalculatorData | null; rotationPreset?: RotationPreset | null }) {
  const lang: Lang = localePrefix === "/ru" ? "ru" : "en";
  const tr = characterPageText(lang);
  const bookRef = useRef<HTMLElement>(null);
  useCharacterBookReveals(bookRef, dataMode === "battle-net");
  const initialTheme = getTalentSpecTheme(initialSnapshot.specialization.slug) ?? defaultTalentSpecTheme;
  const profileBuild = (talentData?.buildVersion || rotationPreset?.patch || "unknown").replace(/[^A-Za-z0-9._%:+-]/g, "-").slice(0, 64);
  const [snapshot, setSnapshot] = useState<CharacterAuditSnapshot>(initialSnapshot);
  // Test recommendations belong only to the fixture page. A connected
  // Battle.net character must never inherit hidden demo audit state.
  const [issues, setIssues] = useState<CharacterAuditIssue[]>(() => dataMode === "fixture" ? getTestCharacterTalentAudit(initialTheme).issues : []);
  const [selectedGear, setSelectedGear] = useState<AuditGearItem | null>(null);
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  const [running, setRunning] = useState(false);
  const [details, setDetails] = useState(true);
  const [talentScenario, setTalentScenario] = useState<TalentScenarioId>("mythic-plus");
  const [history, setHistory] = useState(() => dataMode === "fixture" ? initialHistory : []);
  const [modelFocus, setModelFocus] = useState<string | null>(null);
  const [rotationTalentLoadout, setRotationTalentLoadout] = useState(initialSnapshot.activeTalentLoadout ?? "");
  const [rotationSimulation, setRotationSimulation] = useState<RotationSimulationResult | null>(null);
  const [diagnostic, setDiagnostic] = useState<CharacterDiagnosticReport | null>(null);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [snapshotKey, setSnapshotKey] = useState(`${initialFingerprint ?? "initial-profile"}:${profileBuild}`);
  const [refreshState, setRefreshState] = useState<CharacterRefreshState>({ status: "idle" });
  const syncRotationTalentLoadout = useCallback((candidate: string) => setRotationTalentLoadout(candidate), []);

  const resolvedRotationPreset = useMemo(() => rotationPreset ? {
    ...rotationPreset,
    abilities: rotationPreset.abilities.map((ability) => ({
      ...ability,
      iconUrl: abilityIcon(ability.id) || talentAbilityIcon(ability, talentData) || ability.iconUrl,
    })),
  } : null, [rotationPreset, talentData]);

  const rotationSpellbookAbilities = useMemo(() => buildRotationSpellbook({
    baseAbilities: resolvedRotationPreset?.abilities ?? [],
    talentData,
    talentLoadout: rotationTalentLoadout || snapshot.activeTalentLoadout || "",
  }), [resolvedRotationPreset?.abilities, rotationTalentLoadout, snapshot.activeTalentLoadout, talentData]);

  const theme = getTalentSpecTheme(snapshot.specialization.slug) ?? initialTheme;
  const talentAudit = dataMode === "fixture" ? getTestCharacterTalentAudit(theme, talentScenario) : null;
  const totalPotential = talentAudit?.issues.reduce((sum, issue) => sum + issue.gain, 0) ?? 0;
  const gain = issues.reduce((sum, issue) => sum + issue.gain, 0);
  const displayedGain = gain;
  const score = snapshot.scores && talentAudit ? Math.min(100, Math.round(snapshot.scores.overall + (totalPotential - displayedGain))) : null;
  const critical = issues.filter((issue) => issue.tone === "critical");
  const recommended = issues.filter((issue) => issue.tone === "recommended");
  const optional = issues.filter((issue) => issue.tone === "optional");
  const sockets = snapshot.gear.flatMap((item) => item.details.sockets ?? []);
  const filledSockets = sockets.filter((socket) => socket.filled).length;
  const enchantedItems = snapshot.gear.filter((item) => item.details.enchant?.active).length;
  const equipment = useMemo(() => splitEquipment(snapshot.gear), [snapshot.gear]);
  const realProfileEvidence = [
    {
      label: tr("Таланты"),
      value: snapshot.activeTalentLoadout ? tr("Загружены") : tr("Нет данных"),
      detail: tr("Источник: Battle.net Specializations API. Это статус импорта, а не оценка силы билда."),
    },
    {
      label: tr("Предметов"),
      value: String(snapshot.gear.length),
      detail: tr("Источник: Battle.net Equipment API. Показано число импортированных предметов, а не рейтинг качества."),
    },
    {
      label: tr("Чары"),
      value: String(enchantedItems),
      detail: tr("Источник: enchantments в Battle.net Equipment API. Это число распознанных чар, а не процент оптимальности."),
    },
    {
      label: tr("Сокеты"),
      value: sockets.length ? `${filledSockets} ${lang === "ru" ? "из" : "of"} ${sockets.length}` : tr("Нет сокетов"),
      detail: tr("Источник: sockets в Battle.net Equipment API. Показана заполненность доступных сокетов, а не рейтинг персонажа."),
    },
  ];

  useEffect(() => {
    if (dataMode === "battle-net") return;
    const controller = new AbortController();
    fetch(`/api/wow/characters/${encodeURIComponent(initialSnapshot.slug)}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("audit data unavailable")))
      .then((data: CharacterAuditSnapshot) => {
        setSnapshot(data);
        const loadedTheme = getTalentSpecTheme(data.specialization.slug) ?? initialTheme;
        setIssues(getTestCharacterTalentAudit(loadedTheme).issues);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [dataMode, initialSnapshot.slug]);

  const fix = (id: string) => setIssues((items) => items.filter((issue) => issue.id !== id));
  const selectTalentScenario = (scenario: TalentScenarioId) => {
    setTalentScenario(scenario);
    if (dataMode === "fixture") setIssues(getTestCharacterTalentAudit(theme, scenario).issues);
  };
  const toggleGearPin = (item: AuditGearItem) => setSelectedGear((current) => current?.slot === item.slot ? null : item);
  const applyAll = () => {
    setIssues([]);
    setSaved(false);
  };
  const refreshCharacter = async () => {
    if (running) return;
    setRunning(true);
    setRefreshState({ status: "idle" });
    try {
      const response = await fetch(`/api/wow/characters/${encodeURIComponent(snapshot.slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: localePrefix === "/ru" ? "ru" : "en" }),
      });
      const payload = await response.json() as CharacterRefreshPayload;
      if (payload.snapshot) {
        const specializationChanged = payload.snapshot.specialization.slug !== snapshot.specialization.slug
          || payload.snapshot.activeHeroTalentTreeId !== snapshot.activeHeroTalentTreeId;
        setSnapshot(payload.snapshot);
        setRotationTalentLoadout(payload.snapshot.activeTalentLoadout ?? "");
        if (payload.fingerprint) setSnapshotKey(`${payload.fingerprint}:${profileBuild}`);
        if (specializationChanged) {
          window.location.reload();
          return;
        }
      }
      if (!response.ok) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? 0) || undefined;
        const messages: Record<string, string> = {
          session_expired: tr("Сессия Battle.net истекла. Переподключите аккаунт и повторите обновление."),
          access_forbidden: tr("Battle.net не разрешил доступ к профилю. Переподключите аккаунт и проверьте разрешения."),
          character_not_found: tr("Персонаж больше не найден среди персонажей подключённого аккаунта."),
          incomplete_profile: payload.reason === "active_loadout_missing" ? tr("Battle.net обновил персонажа, но не отдал активный билд. Войдите в игру, переключите специализацию и выйдите из неё.") : tr("Battle.net вернул неполный профиль. Попробуйте снова после выхода персонажа из игры."),
          rate_limited: lang === "ru" ? `Battle.net временно ограничил запросы. Повторите примерно через ${retryAfter ?? 60} сек.` : `Battle.net rate limit reached. Try again in about ${retryAfter ?? 60} seconds.`,
          battle_net_unavailable: tr("Battle.net сейчас недоступен. Старые данные сохранены — попробуйте обновить позже."),
        };
        setRefreshState({ status: "error", code: payload.error, message: messages[payload.error ?? ""] ?? "Не удалось обновить профиль.", retryAfter });
        return;
      }
      setRefreshState({ status: "success", message: tr("Профиль обновлён. Старые результаты расчётов сброшены.") });
    } catch {
      setRefreshState({ status: "error", code: "network_error", message: tr("Нет связи с сервером Gildra. Текущие данные не изменены.") });
    } finally {
      setRunning(false);
    }
  };
  const rerun = () => {
    if (running) return;
    if (dataMode === "battle-net") {
      void refreshCharacter();
      return;
    }
    setRunning(true);
    window.setTimeout(() => {
      setHistory((items) => [{ at: "только что", date: "сегодня", score: score ?? 0, delta: "+0" }, ...items].slice(0, 3));
      setRunning(false);
    }, 720);
  };
  const share = async () => {
    if (dataMode === "battle-net") {
      document.getElementById("audit-history")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setShared(true);
      window.setTimeout(() => setShared(false), 2200);
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch {
      const fallback = document.createElement("textarea");
      fallback.value = window.location.href;
      fallback.setAttribute("readonly", "");
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.appendChild(fallback);
      fallback.select();
      try {
        document.execCommand("copy");
      } catch {
        // The visual confirmation still provides deterministic feedback in
        // restricted browsers where both clipboard mechanisms are blocked.
      } finally {
        fallback.remove();
      }
    } finally {
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    }
  };
  const runDiagnostic = async () => {
    if (diagnosticBusy || dataMode !== "battle-net") return;
    setDiagnosticBusy(true);
    setDiagnostic(null);
    try {
      const response = await fetch(`/api/wow/characters/${encodeURIComponent(snapshot.slug)}/diagnostics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: lang }) });
      const payload = await response.json() as CharacterDiagnosticReport;
      setDiagnostic(payload);
    } catch {
      setDiagnostic({ error: "network_error", message: tr("Не удалось получить диагностический отчёт") });
    } finally {
      setDiagnosticBusy(false);
    }
  };
  return (
    <CharacterPageLanguage.Provider value={lang}><CharacterBookTheme.Provider value={dataMode === "battle-net"}>
    <main
      ref={bookRef}
      className={`${styles.audit} ${dataMode === "battle-net" ? `${surface.root} ${grimoire.theme} ${typography.typography} ${book.layout} ${motion.page} ${illumination.page}` : ""}`}
      id="audit-overview"
      lang={lang}
      tabIndex={-1}
      data-motif={theme.motif}
      data-profile-source={dataMode}
      data-character-workspace={dataMode === "battle-net" ? "live" : "fixture"}
      data-character-book={dataMode === "battle-net" ? "open" : undefined}
      style={{
        ...(dataMode === "battle-net" ? physicalBookMaterials : {}),
        "--spec-accent": theme.accent,
        "--spec-hot": theme.hot,
        "--spec-deep": theme.deep,
        "--spec-rgb": theme.accentRgb,
        "--spec-hot-rgb": theme.hotRgb,
        "--spec-ambient-rgb": theme.ambientRgb,
        "--tc-accent": theme.accent,
        "--tc-hot": theme.hot,
        "--tc-deep": theme.deep,
        "--tc-accent-rgb": theme.accentRgb,
        "--tc-hot-rgb": theme.hotRgb,
        "--tc-ambient-rgb": theme.ambientRgb,
      } as CSSProperties}
    >
      {dataMode === "battle-net" ? <div className={surface.backdrop} data-character-book-backdrop><CharacterBookBackdrop /></div> : null}
      <div className={dataMode === "battle-net" ? surface.content : styles.pageContents}>
      <header className={styles.topbar}>
        <a href={dataMode === "battle-net" ? `${localePrefix}/wow/characters` : `${localePrefix}/wow`} className={styles.brand}>GILDRA</a>
        <span className={styles.game}>W <b>World of Warcraft</b></span>
        <nav aria-label={tr("Разделы World of Warcraft")}>
          <a href={`${localePrefix}/talents/fury-warrior`}>{tr("Спеки")}</a><a href={`${localePrefix}/wow/mythic-plus`}>{tr("Эпох+")}</a><a href={`${localePrefix}/wow/raids`}>{tr("Рейд")}</a>
          <a href={`${localePrefix}/talents/fury-warrior`}>{tr("Таланты")}</a><a href={`${localePrefix}/wow`}>{tr("Гайды")}</a>
        </nav>
        <label className={styles.search}><input aria-label={tr("Поиск по Gildra")} placeholder={tr("Поиск по Gildra…")} /><span>⌕</span></label>
      </header>

      <div className={dataMode === "battle-net" ? `${styles.manuscript} ${surface.manuscript}` : styles.pageContents}>
      {dataMode === "battle-net" ? <PhysicalBookFrame /> : null}
      {dataMode === "battle-net" ? <CharacterBookNavigation characterName={snapshot.character.name} hasRotation={Boolean(resolvedRotationPreset)} lang={lang} /> : null}

      {dataMode === "battle-net" ? <CharacterBookMasthead locale={lang} rightLabel={tr("Летопись героя")} /> : null}
      <section className={`${styles.hero} ${book.hero}`}>
        {dataMode === "battle-net" ? <WarcraftFrame /> : null}
        {dataMode === "battle-net" ? <div className={styles.connectionDock}><div className={styles.importedBanner}><ShieldCheck />{tr("Battle.net подключён")} <span>{tr("Персонаж и экипировка импортированы")}</span><button data-folio-action="quiet" type="button" disabled={diagnosticBusy} onClick={() => void runDiagnostic()}><ClipboardCheck />{diagnosticBusy ? tr("Проверяем функции…") : tr("Проверить функции")}</button></div>{refreshState.status !== "idle" ? <section className={styles.refreshNotice} data-status={refreshState.status} role={refreshState.status === "error" ? "alert" : "status"} aria-live="polite"><span>{refreshState.status === "success" ? <Check /> : <AlertTriangle />}<b>{refreshState.status === "success" ? tr("Данные обновлены") : tr("Обновление не завершено")}</b><small>{refreshState.message}</small></span>{refreshState.status === "error" ? refreshState.code === "session_expired" || refreshState.code === "access_forbidden" ? <a href={`${localePrefix}/login`}>{tr("Переподключить Battle.net")}</a> : refreshState.code === "character_not_found" ? <a href={`${localePrefix}/wow/characters`}>{tr("К списку персонажей")}</a> : <button data-folio-action type="button" onClick={() => void refreshCharacter()} disabled={running}>{running ? tr("Обновляем…") : tr("Повторить")}</button> : null}</section> : null}{diagnostic ? <section className={styles.characterDiagnostic} aria-live="polite"><header><b>{diagnostic.status === "passed" ? tr("Все подключённые функции работают") : tr("Диагностика нашла проблему")}</b>{diagnostic.reportId ? <code>#{diagnostic.reportId}</code> : null}</header>{diagnostic.checks?.length ? <ul>{diagnostic.checks.map((check) => <li key={check.id} data-status={check.status}><i>{check.status === "pass" ? "✓" : check.status === "skip" ? "—" : "!"}</i><span><b>{check.label}</b><small>{check.detail}</small></span></li>)}</ul> : <p>{diagnostic.message ?? tr("Неизвестная ошибка")}</p>}</section> : null}</div> : null}
        <div className={styles.specAtmosphere} aria-hidden="true"><SpecSignatureFx specSlug={theme.slug} /></div>
        <div className={book.identity} data-book-identity={dataMode === "battle-net" || undefined}>
        <div className={styles.avatar}><img src={snapshot.specialization.iconUrl} alt="" /></div>
        <div className={`${styles.name} ${book.name}`}>
          <span className={styles.profileEyebrow}><i /> {tr("Книга героя")} <b>·</b> {characterRoleLabel(theme.role, lang)}</span>
          <h1>{snapshot.character.name}</h1>
          <p><Trophy /> {snapshot.character.className} <i /> {snapshot.character.race}</p>
          <small>{tr("Уровень")} {snapshot.character.level} <b>·</b> {snapshot.character.faction} <b>·</b> {dataMode === "battle-net" ? "Battle.net" : tr("тестовый персонаж")}</small>
          <a className={styles.rosterLink} href={`${localePrefix}/wow/characters`}><Users />{tr("Все персонажи аккаунта")}</a>
          {dataMode === "fixture" ? <div className={styles.rage} aria-label={`${snapshot.specialization.resourceLabel}: 100 из 100`}><span>{snapshot.specialization.resourceLabel === "Ярость" ? <Flame /> : <Sparkles />} {snapshot.specialization.resourceLabel}</span><i><b /></i><strong>100</strong></div> : null}
        </div>
        </div>
        <div className={book.metrics} data-book-metrics={dataMode === "battle-net" || undefined}>
        <Metric className={styles.itemLevelMetric} label={tr("Уровень предметов")} value={String(snapshot.character.itemLevel)} />
        <Metric className={styles.mythicMetric} label={tr("Рейтинг Эпох+")} value={snapshot.character.mythicRating.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")} />
        </div>
        <div className={`${styles.heroActions} ${book.actions}`} data-folio-tools>
          <button onClick={rerun} type="button" disabled={running} aria-busy={running}><RefreshCw className={running ? styles.spin : ""} /><span>{running ? tr("Обновляем…") : tr("Обновить")}</span></button>
          <button onClick={share} type="button" aria-label={dataMode === "battle-net" ? tr("Поделиться результатом расчёта") : tr("Поделиться")}><Share2 /><span>{dataMode === "battle-net" ? shared ? tr("Выберите расчёт ниже") : tr("Поделиться") : shared ? tr("Ссылка скопирована") : tr("Поделиться")}</span></button>
        </div>
        {dataMode === "battle-net" ? <>
          <div className={`${styles.realProfileStatus} ${book.status}`} role="status" aria-label={tr("Статус реальных данных Battle.net")} title={tr("Персонаж импортирован из Battle.net; общая оценка не назначается без симуляции.")}><ShieldCheck /><b>Battle.net</b><span>{tr("Профиль персонажа")}</span></div>
          <div className={`${styles.scoreTiles} ${styles.realProfileEvidence} ${book.evidence}`}>{realProfileEvidence.map((entry) => <EvidenceTile key={entry.label} {...entry} />)}</div>
        </> : snapshot.scores ? <>
          <div className={styles.score}><b>{score}<small>/100</small></b><span>Сильно,<br />{issues.length} {issues.length === 1 ? "проблема" : "проблем"}</span></div>
          <div className={styles.scoreTiles}><ScoreTile label={tr("Таланты")} value={String(snapshot.scores.talents)} good={snapshot.scores.talents >= 88} /><ScoreTile label="Шмот" value={String(snapshot.scores.gear)} good={snapshot.scores.gear >= 88} /><ScoreTile label={tr("Чары")} value={String(snapshot.scores.enchants)} bad={snapshot.scores.enchants < 78} /><ScoreTile label="Камни" value={String(snapshot.scores.gems)} good={snapshot.scores.gems >= 88} /></div>
        </> : null}
      </section>

      <div className={styles.grid}>
        {dataMode === "battle-net" ? <CharacterChapter id="chapter-armory" index="01" eyebrow={tr("Арсенал")} title={tr("Экипировка и характеристики")} description={tr("Предметы, характеристики и облик вашего персонажа.")} icon={<Shield />} /> : null}

        <section className={`${styles.gearPanel} ${dataMode === "battle-net" ? `${styles.realGearPanel} ${armoryBook.armory}` : ""}`} id="audit-gear" aria-labelledby="equipment-heading">
          {dataMode === "battle-net" ? <WarcraftFrame /> : null}
          <header className={`${styles.paperDollTitle} ${armoryBook.heading}`} data-folio-divider data-armory-heading>
            <h2 id="equipment-heading">{dataMode === "battle-net" ? tr("Боевые показатели") : tr("Экипировка")}</h2>
            <small>{snapshot.specialization.specName} · {snapshot.character.itemLevel} {tr("ур. предметов")}</small>
          </header>
          <EquipmentStatStrip stats={snapshot.combatStats} />
          <div className={`${styles.panelMotion} ${styles.motionGear}`} aria-hidden="true"><i /><i /><i /><span /></div>
          <div className={`${styles.gearWorkbench} ${armoryBook.workbench}`}>
            <div className={`${styles.gearList} ${styles.gearListLeft}`}>{equipment.left.map((item) => <GearItem key={item.slot} item={item} pinned={selectedGear?.slot === item.slot} hoverDisabled={selectedGear !== null && selectedGear.slot !== item.slot} onSelect={toggleGearPin} onHighlight={setModelFocus} />)}</div>
            <CharacterModelViewer lang={lang} appearance={snapshot.appearance} focusSlot={modelFocus} characterName={snapshot.character.name} race={snapshot.character.race} specIcon={snapshot.specialization.iconUrl} accent={snapshot.specialization.accent} characterSlug={snapshot.slug} />
            <div className={`${styles.gearList} ${styles.gearListRight}`}>{equipment.right.map((item) => <GearItem key={item.slot} item={item} pinned={selectedGear?.slot === item.slot} hoverDisabled={selectedGear !== null && selectedGear.slot !== item.slot} onSelect={toggleGearPin} onHighlight={setModelFocus} />)}</div>
            {equipment.weapons.length ? <div className={`${styles.weaponPair} ${armoryBook.weapons}`} data-weapon-count={equipment.weapons.length} data-armory-weapon-row aria-label={lang === "ru" ? `Комплект оружия специализации «${snapshot.specialization.specName}»` : `Weapons for ${snapshot.specialization.specName}`}><span className={`${styles.weaponPairLabel} ${armoryBook.weaponTitle}`}>{snapshot.specialization.resourceLabel === "Ярость" ? <Flame /> : <Sparkles />} {tr("Оружие")}</span>{equipment.weapons.map((item) => <GearItem key={item.slot} item={item} pinned={selectedGear?.slot === item.slot} hoverDisabled={selectedGear !== null && selectedGear.slot !== item.slot} onSelect={toggleGearPin} onHighlight={setModelFocus} />)}</div> : null}
          </div>
        </section>

        {dataMode === "battle-net" ? <DeferredMount minHeight={420}><CharacterGearOptimizer localePrefix={localePrefix} characterSlug={snapshot.slug} specializationSlug={snapshot.specialization.slug} gear={snapshot.gear} snapshotKey={snapshotKey} /></DeferredMount> : null}

        {talentAudit ? <><section className={styles.plan} id="audit-actions">
          <div className={`${styles.panelMotion} ${styles.motionPlan}`} aria-hidden="true"><i /><i /><i /><span /></div>
          <h2>План действий <HelpTip title="Как устроен приоритет">Сначала показаны исправления с самым высоким влиянием на профиль специализации «{theme.specNameRu}» в режиме «{talentAudit.scenario.label}». Значение справа — предварительная оценка прироста.</HelpTip></h2>
          <IssueGroup title="Критично" issues={critical} onFix={fix} metricLabel={talentAudit.metricLabel} />
          <IssueGroup title="Рекомендуется" issues={recommended} onFix={fix} metricLabel={talentAudit.metricLabel} />
          <IssueGroup title="Опционально" issues={optional} onFix={fix} metricLabel={talentAudit.metricLabel} />
          {!issues.length ? <div className={styles.clearPlan}><Check /> Все проблемы исправлены. Аудит готов.</div> : null}
          <footer>Потенциальный прирост после исправлений <b>+{displayedGain.toFixed(1)}% {talentAudit.metricLabel}</b></footer>
        </section>

        <aside className={styles.right}>
          <div className={`${styles.panelMotion} ${styles.motionIntel}`} aria-hidden="true"><i /><i /><i /><span /></div>
          <section className={styles.talent} id="audit-talents">
            <h2>Аудит талантов · {talentAudit.scenario.shortLabel} <HelpTip title="Сравнение талантов">Текущий набор сравнивается с рекомендуемым билдом специализации «{snapshot.specialization.specName}» для режима «{talentAudit.scenario.label}».</HelpTip><button aria-pressed={details} onClick={() => setDetails((value) => !value)} type="button">{details ? "Скрыть детали" : "Полное дерево"}<ChevronRight /></button></h2>
            <div className={styles.talentIdentity}><img src={theme.iconUrl} alt="" /><span><small>{theme.roleRu} · {theme.heroPaths[0].nameRu}</small><b>{theme.fantasy}</b></span></div>
            <div className={styles.talentTrees}><TalentTree label="Сейчас · 2 проблемы" nodes={talentAudit.current} /><ChevronRight /><TalentTree label="Рекомендуется" nodes={talentAudit.recommended} /></div>
            {details ? <div className={styles.keyChanges}><b>Ключевые изменения · {snapshot.specialization.specName}</b>{talentAudit.changes.map((change) => <span key={`${change.from}-${change.to}`}>{change.from} <ChevronRight /> {change.to} <em>+{change.gain.toFixed(1)}% {talentAudit.metricLabel}</em></span>)}</div> : null}
          </section>
          <StatBalance primaryStat={snapshot.specialization.primaryStatLabel} priority={talentAudit.statPriority} />
          <section className={styles.readiness}><h2>Готовность к контенту <HelpTip title="Оценка готовности">Учитываются уровень предметов, чары, камни, характеристики и критические ошибки билда.</HelpTip></h2><Readiness label="Эпох+ +12" value="100%" state="Готов" /><Readiness label="Героический рейд" value="100%" state="Готов" /><Readiness label="Эпохальный рейд" value="13%" state="В процессе" warn /></section>
        </aside></> : null}

        {dataMode === "battle-net" ? <CharacterChapter id="chapter-talents" index="02" eyebrow={tr("Таланты")} title={tr("Таланты и симуляция")} description={tr("Соберите билд и сравните его урон в выбранном режиме боя.")} icon={<Sparkles />} /> : null}

        <DeferredMount minHeight={620}><CharacterTalentSimulator data={talentData} characterSlug={snapshot.slug} specSlug={snapshot.specialization.slug} loadout={snapshot.activeTalentLoadout} baseStats={snapshot.combatStats} scenario={talentScenario} onScenarioChange={selectTalentScenario} onCandidateLoadoutChange={syncRotationTalentLoadout} dataMode={dataMode} localePrefix={localePrefix} snapshotKey={snapshotKey} /></DeferredMount>

        {resolvedRotationPreset ? <>
          {dataMode === "battle-net" ? <CharacterChapter id="chapter-rotation" index="03" eyebrow={tr("Боевая практика")} title={tr("Ротация и тренировка")} description={tr("Настройте панель умений и проверьте ротацию на своём билде.")} icon={<Zap />} /> : null}
          <section className={styles.rotationEmbed} id="audit-rotation" aria-label={localePrefix === "/ru" ? "Тренер ротации персонажа" : "Character rotation trainer"}>
          {dataMode === "battle-net" ? <WarcraftFrame /> : null}
          {dataMode === "fixture" ? <div className={styles.rotationBridge}><Zap /><span><small>{localePrefix === "/ru" ? "ТАЛАНТЫ → РОТАЦИЯ → DPS" : "TALENTS → ROTATION → DPS"}</small><strong>{localePrefix === "/ru" ? "Текущий билд уже подключён к расчёту ниже" : "Your current build is connected to the simulation below"}</strong></span><b>{rotationTalentLoadout ? (localePrefix === "/ru" ? "Синхронизировано" : "Synced") : (localePrefix === "/ru" ? "Активный билд" : "Active build")}</b></div> : null}
          <DeferredMount minHeight={760}><RotationLabPage key={`rotation-${snapshotKey}`} preset={resolvedRotationPreset} spellbookAbilities={rotationSpellbookAbilities} lang={localePrefix === "/ru" ? "ru" : "en"} characterSlug={snapshot.slug} dataMode={dataMode} characterIdentity={dataMode === "battle-net" ? { name: snapshot.character.name, itemLevel: snapshot.character.itemLevel } : undefined} connectedTalentLoadout={rotationTalentLoadout} profileFingerprint={snapshotKey} onSimulationResult={setRotationSimulation} embedded /></DeferredMount>
        </section>
        </> : null}

        {dataMode === "battle-net" ? <><CharacterChapter id="chapter-logs" index="04" eyebrow={tr("Разбор боя")} title={tr("Логи и боевые данные")} description={tr("Сверьте расчёт с реальным боем и найдите потерянный урон по конкретным механикам.")} icon={<ChartNoAxesColumnIncreasing />} /><DeferredMount minHeight={480}><CharacterLogAnalysis characterSlug={snapshot.slug} specializationSlug={snapshot.specialization.slug} localePrefix={localePrefix} simulation={rotationSimulation} abilities={resolvedRotationPreset?.abilities ?? []} /></DeferredMount></> : null}

        {dataMode === "battle-net" ? <><CharacterChapter id="chapter-history" index="05" eyebrow={tr("Хроника")} title={tr("История расчётов")} description={tr("Сохранённые снимки профиля, результаты симуляций и ссылки для сравнения прогресса.")} icon={<Trophy />} /><DeferredMount minHeight={320}><CharacterHistory characterSlug={snapshot.slug} specializationSlug={snapshot.specialization.slug} fingerprint={snapshotKey} localePrefix={localePrefix} /></DeferredMount></> : null}

        {talentAudit ? <><TalentLab audit={talentAudit} selected={talentScenario} onSelect={selectTalentScenario} specName={snapshot.specialization.specName} dataMode={dataMode} />

        <section className={styles.bundle}>
          <h2>Пакет быстрых исправлений <HelpTip title="Исправить одним действием">Применяет безопасные чары и камни, которые не требуют замены предметов или талантов.</HelpTip></h2>
          <p>Безопасные рекомендуемые исправления в один клик.</p>
          <div className={styles.bundleBody}>
            <div className={styles.materials}><ItemIcon src="https://wow.zamimg.com/images/wow/icons/large/inv_misc_gem_bloodstone_02.jpg" /><ItemIcon src="https://wow.zamimg.com/images/wow/icons/large/inv_misc_gem_sapphire_02.jpg" /><ItemIcon src="https://wow.zamimg.com/images/wow/icons/large/inv_misc_gem_amethyst_02.jpg" /></div>
            <b className={styles.gold}>18 450 <small>золота</small></b>
          </div>
          <button type="button" onClick={applyAll} disabled={!issues.length}><Flame />{issues.length ? "Применить все исправления" : "Все исправления применены"}</button>
        </section>

        <div className={styles.auditActions}>
          <section className={styles.rerun}><RotateCcw /><div><h2>Повторить аудит</h2><p>Повторно сканирует персонажа и обновляет рекомендации.</p></div><button type="button" onClick={rerun}><RotateCcw />{running ? "Проверяем…" : "Повторить аудит"}</button></section>
          <section className={styles.save}><ClipboardCheck /><div><h2>Сохранить чек-лист</h2><p>Сохрани аудит и отслеживай прогресс.</p></div><button type="button" onClick={() => setSaved(true)}><ClipboardCheck />{saved ? "Сохранено" : "Сохранить"}</button></section>
        </div>

        <section className={styles.history} id="audit-history">
          <h2>История аудитов <HelpTip title="История прогресса">Последние результаты проверки персонажа. Изменение справа показывает прирост рейтинга с прошлого аудита.</HelpTip><button type="button" onClick={rerun}><RefreshCw />{tr("Обновить")}</button></h2>
          {history.map((row) => <div key={`${row.at}-${row.score}`}><span>{row.at}</span><small>{row.date}</small><b>{row.score}<i>/100</i></b><em>{row.delta}</em></div>)}
        </section></> : null}
      </div>

      <footer className={`${styles.footer} ${book.footer} ${illumination.colophon}`}><div>{dataMode === "battle-net" ? <BookEngraving motif="logs" /> : <ShieldCheck />}<span>{tr("Держите персонажа в форме — повторяйте аудит после еженедельного сундука.")}</span></div><span>{dataMode === "battle-net" ? tr("Экипировка Battle.net API") : snapshot.source === "catalog" ? tr("Предметы из каталога") : tr("Тестовый набор предметов")} · {snapshot.updatedAt} <RefreshCw /></span></footer>
      </div>
      </div>
    </main>
    </CharacterBookTheme.Provider></CharacterPageLanguage.Provider>
  );
}

function Metric({ label, value, className = "" }: { label: string; value: string; className?: string }) { return <div className={`${styles.metric} ${className}`}><small>{label}</small><b>{value}</b></div>; }
function ScoreTile({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) { return <div className={good ? styles.tileGood : bad ? styles.tileBad : ""}><b>{value}</b><small>{label}</small></div>; }
function EvidenceTile({ label, value, detail }: { label: string; value: string; detail: string }) { return <div title={detail} aria-label={`${label}: ${value}. ${detail}`}><b>{value}</b><small>{label}</small></div>; }

function EquipmentStatStrip({ stats }: { stats?: CharacterAuditSnapshot["combatStats"] }) {
  const lang = useContext(CharacterPageLanguage);
  const tr = characterPageText(lang);
  const value = (stat: number | undefined) => typeof stat === "number" && Number.isFinite(stat) ? `${stat.toLocaleString(lang === "ru" ? "ru-RU" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "—";
  const rows = [
    { label: tr("Критический удар"), value: value(stats?.crit), Icon: Crosshair },
    { label: tr("Скорость"), value: value(stats?.haste), Icon: Zap },
    { label: tr("Искусность"), value: value(stats?.mastery), Icon: Gauge },
    { label: tr("Универсальность"), value: value(stats?.versatility), Icon: Shield },
  ];
  return <div className={`${styles.equipmentStats} ${armoryBook.stats}`} data-armory-stats role="group" aria-label={tr("Боевые характеристики персонажа")}>{rows.map(({ label, value, Icon }) => <div className={armoryBook.statCell} key={label}><i aria-hidden="true"><Icon /></i><span><small>{label}</small><b>{value}</b></span></div>)}</div>;
}

const gearQualityTone: Record<AuditGearQuality, string> = {
  "Низкое качество": "poor",
  "Обычный": "common",
  "Необычный": "uncommon",
  "Редкий": "rare",
  "Эпический": "epic",
  "Легендарный": "legendary",
  "Артефакт": "artifact",
  "Наследуемый": "heirloom",
  "Неизвестное качество": "common",
};

function GearItem({ item, pinned, hoverDisabled, onSelect, onHighlight }: { item: AuditGearItem; pinned: boolean; hoverDisabled: boolean; onSelect: (item: AuditGearItem) => void; onHighlight: (slot: string | null) => void }) {
  const lang = useContext(CharacterPageLanguage);
  const tr = characterPageText(lang);
  const stateClass = styles[`gear${item.state[0].toUpperCase()}${item.state.slice(1)}` as keyof typeof styles];
  const weaponClass = weaponEquipmentSlots.has(item.slotType?.toUpperCase() ?? "") || weaponEquipmentNames.has(item.slot) ? styles.weaponItem : "";
  const iconTone = gearQualityTone[item.details.quality];
  return <WarcraftTooltip block pinned={pinned} hoverDisabled={hoverDisabled} onPinnedClose={() => onSelect(item)} content={<GearTooltipContent item={item} pinned={pinned} />}><button type="button" aria-pressed={pinned} aria-label={`${item.name}, ${tr("Уровень предмета")} ${item.itemLevel}. ${tr(gearStateLabels[item.state])}. ${pinned ? tr("Описание открыто") : tr("Открыть описание предмета")}`} data-quality={item.details.quality} className={`${styles.gearItem} ${stateClass} ${weaponClass} ${pinned ? styles.gearPinned : ""}`} onClick={() => onSelect(item)} onPointerEnter={() => onHighlight(item.slot)} onPointerLeave={() => onHighlight(null)} onFocus={() => onHighlight(item.slot)} onBlur={() => onHighlight(null)}><ItemIcon src={item.iconUrl} tone={iconTone} level={item.itemLevel} /><span className={styles.gearCopy}><small>{item.slot}</small><b>{item.name}</b><em className={styles.gearItemMeta}><strong>{item.itemLevel}</strong>{item.details.enchant ? <i data-active={item.details.enchant.active || undefined} title={item.details.enchant.active ? tr("Чары установлены") : tr("Чары отсутствуют")}>✦</i> : null}{item.details.sockets?.map((socket, index) => <i key={`${socket.gem}-${index}`} data-socket={socket.color} data-active={socket.filled || undefined} title={socket.gem} />)}</em></span>{item.state === "issue" || item.state === "missing" ? <AlertTriangle /> : null}</button></WarcraftTooltip>;
}

function WarcraftTooltip({ children, content, block = false, pinned = false, hoverDisabled = false, onPinnedClose }: { children: ReactNode; content: ReactNode; block?: boolean; pinned?: boolean; hoverDisabled?: boolean; onPinnedClose?: () => void }) {
  const tr = useCharacterText();
  const bookTheme = useContext(CharacterBookTheme);
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pinnedCloseRef = useRef(onPinnedClose);
  pinnedCloseRef.current = onPinnedClose;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPinnedRef = useRef(pinned);
  const suppressHoverRef = useRef(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, side: "bottom" as "top" | "bottom" });
  const open = pinned || hoverOpen;

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const tooltipWidth = Math.min(420, window.innerWidth - 24);
    const tooltipHeight = Math.min(tooltipRef.current?.offsetHeight ?? 420, window.innerHeight - 24);
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 12));
    const spaceAbove = rect.top - 12;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const side = spaceAbove >= tooltipHeight || spaceAbove > spaceBelow ? "top" : "bottom";
    const top = side === "top"
      ? Math.max(tooltipHeight + 12, rect.top - 10)
      : Math.min(rect.bottom + 10, window.innerHeight - tooltipHeight - 12);
    setPosition({ left, top, side });
  }, []);

  const show = () => {
    if (hoverDisabled || suppressHoverRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      updatePosition();
      setHoverOpen(true);
    }, 120);
  };
  const hide = () => {
    suppressHoverRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHoverOpen(false), 70);
  };

  useEffect(() => {
    if (pinned) {
      if (timerRef.current) clearTimeout(timerRef.current);
      suppressHoverRef.current = false;
      setHoverOpen(false);
      updatePosition();
    } else if (wasPinnedRef.current) {
      suppressHoverRef.current = true;
      setHoverOpen(false);
    }
    wasPinnedRef.current = pinned;
  }, [pinned, updatePosition]);

  useEffect(() => {
    if (hoverDisabled) setHoverOpen(false);
  }, [hoverDisabled]);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const schedulePosition = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updatePosition();
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", schedulePosition, { capture: true, passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", schedulePosition, true);
    };
  }, [open, updatePosition]);

  const hasPinnedClose = Boolean(onPinnedClose);
  useEffect(() => {
    if (!pinned || !hasPinnedClose) return;
    if (window.matchMedia("(max-width: 560px)").matches) closeRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      pinnedCloseRef.current?.();
      anchorRef.current?.querySelector("button")?.focus();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [pinned, hasPinnedClose]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const closePinned = () => {
    onPinnedClose?.();
    anchorRef.current?.querySelector("button")?.focus();
  };

  return <>
    <span ref={anchorRef} className={`${styles.tooltipAnchor} ${block ? styles.tooltipBlock : ""}`} aria-describedby={open ? id : undefined} onPointerEnter={show} onPointerLeave={hide} onFocusCapture={show} onBlurCapture={hide}>{children}</span>
    {open ? createPortal(<div ref={tooltipRef} id={id} role={pinned ? "dialog" : "tooltip"} aria-label={pinned ? tr("Описание предмета") : undefined} data-pinned={pinned || undefined} data-character-book={bookTheme ? "open" : undefined} className={`${styles.warcraftTooltip} ${position.side === "top" ? styles.tooltipTop : styles.tooltipBottom} ${bookTheme ? `${typography.typography} ${motion.tooltip}` : ""}`} style={{ ...(bookTheme ? physicalBookMaterials : {}), left: position.left, top: position.top } as CSSProperties}>{pinned && onPinnedClose ? <div className={styles.tooltipControls}><button ref={closeRef} type="button" onClick={closePinned} aria-label={tr("Закрыть описание предмета")}><X /></button></div> : null}{content}</div>, document.body) : null}
  </>;
}

function HelpTip({ title, children }: { title: string; children: ReactNode }) {
  const tr = useCharacterText();
  return <WarcraftTooltip content={<div className={styles.helpTooltipContent}><small>{tr("Справка Gildra")}</small><strong>{title}</strong><p>{children}</p></div>}><span className={styles.helpTrigger} role="button" tabIndex={0} aria-label={`Справка: ${title}`}><CircleHelp /></span></WarcraftTooltip>;
}

function GearTooltipContent({ item, pinned = false }: { item: AuditGearItem; pinned?: boolean }) {
  const lang = useContext(CharacterPageLanguage);
  const tr = characterPageText(lang);
  const stateClass = styles[`tooltip${item.state[0].toUpperCase()}${item.state.slice(1)}` as keyof typeof styles];
  const details = item.details;
  return <div className={styles.gearTooltipContent}>
    <div className={styles.tooltipItemHeader} data-quality={details.quality}><ItemIcon src={item.iconUrl} tone={gearQualityTone[details.quality]} /><div><strong className={details.quality === "Легендарный" ? styles.legendaryName : undefined}>{item.name}</strong><small>{tr(details.quality)} · {details.category}</small></div></div>
    <div className={styles.tooltipLevel}>{tr("Уровень предмета")} <b>{item.itemLevel}</b></div>
    <div className={styles.tooltipBinding}>{details.binding}</div>
    {details.weapon ? <div className={styles.tooltipWeapon}><b>{details.weapon.damage}</b><span>{lang === "ru" ? "Скорость" : "Speed"} {details.weapon.speed}</span><small>{details.weapon.dps} {tr("ед. урона в секунду")}</small></div> : null}
    {details.armor || details.durability ? <div className={styles.tooltipUtility}>{details.armor ? <span>{details.armor}</span> : <span />}{details.durability ? <span>{tr("Прочность")} {details.durability}</span> : null}</div> : null}
    <div className={styles.tooltipStats}>
      {details.primary ? <b>{details.primary}</b> : null}
      {details.stamina ? <b>{details.stamina}</b> : null}
      {details.secondaries.map((stat) => <span key={stat.label}><em>{stat.value}</em> {stat.label}</span>)}
    </div>
    {details.enchant ? <div className={`${styles.tooltipEnchant} ${details.enchant.active ? styles.enchantActive : styles.enchantMissing}`}><small>{details.enchant.active ? tr("Чары") : tr("Нет чар")}</small><b>{details.enchant.name}</b><span>{details.enchant.effect}</span></div> : null}
    {details.sockets?.length ? <div className={styles.tooltipSockets}>{details.sockets.map((socket, index) => <div key={`${socket.gem}-${index}`} className={socket.filled ? styles.socketFilled : styles.socketEmpty}><i data-color={socket.color} /><span><b>{socket.gem}</b><small>{socket.effect}</small></span></div>)}</div> : null}
    {details.set ? <div className={styles.tooltipSet}><strong>{details.set.name} ({details.set.equipped}/{details.set.total})</strong>{details.set.bonuses.map((bonus) => <span key={bonus.pieces} data-active={bonus.active || undefined}>({bonus.pieces}) {tr("Комплект")}: {bonus.text}</span>)}</div> : null}
    <div className={styles.tooltipSource}><small>{tr("Источник")}</small><span>{details.source}</span>{details.sellPrice ? <em>{tr("Цена продажи")} · {details.sellPrice}</em> : null}</div>
    <div className={`${styles.tooltipAudit} ${stateClass}`}><span>{tr(gearStateLabels[item.state])}</span><b>{details.audit.impact}</b><small>{details.audit.nextStep}</small></div>
    <footer>{pinned ? tr("Закреплено · нажмите по иконке ещё раз, чтобы закрыть") : tr("Нажмите по иконке, чтобы закрепить")}</footer>
  </div>;
}

function ItemIcon({ src, tone = "epic", level }: { src?: string; tone?: string; level?: number }) {
  const toneClass = styles[`icon${tone[0].toUpperCase()}${tone.slice(1)}` as keyof typeof styles];
  return <i className={`${styles.itemIcon} ${toneClass}`}>{src ? <img src={src} alt="" /> : <b />}{level ? <small className={styles.itemIconLevel}>{level}</small> : null}</i>;
}

function IssueGroup({ title, issues, onFix, metricLabel }: { title: string; issues: CharacterAuditIssue[]; onFix: (id: string) => void; metricLabel: string }) {
  if (!issues.length) return null;
  const groupClass = styles[`group${issues[0].tone[0].toUpperCase()}${issues[0].tone.slice(1)}` as keyof typeof styles];
  return <section className={`${styles.issueGroup} ${groupClass}`}><h3>{title} <small>({issues.length})</small></h3>{issues.map((issue, index) => <div className={styles.issue} key={issue.id}><span>{index + 1}</span><ItemIcon src={issue.iconUrl} tone={issue.tone === "critical" ? "red" : issue.tone === "optional" ? "blue" : "violet"} /><div><b>{issue.title}</b><small>{issue.detail}</small></div><em>+{issue.gain.toFixed(1)}% {metricLabel}</em><button type="button" onClick={() => onFix(issue.id)}>{issue.action === "Исправить" ? <Wrench /> : issue.action === "Сравнить" ? <ChartNoAxesColumnIncreasing /> : <Settings2 />}<span>{issue.action}</span><ArrowUpRight /></button></div>)}</section>;
}

function TalentLab({ audit, selected, onSelect, specName, dataMode }: { audit: CharacterTalentAuditProfile; selected: TalentScenarioId; onSelect: (scenario: TalentScenarioId) => void; specName: string; dataMode: "fixture" | "battle-net" }) {
  const totalGain = audit.changes.reduce((sum, change) => sum + change.gain, 0);
  return <section className={styles.talentLab} aria-labelledby="talent-lab-heading">
    <header className={styles.talentLabHeader}>
      <div>
        <small>GILDRA BUILD LAB · {specName}</small>
        <h2 id="talent-lab-heading">Почему билд слабее — и что поменять</h2>
        <p>Выберите, где вы играете. Один универсальный билд не может быть лучшим одновременно для рейда, арены и массового боя.</p>
      </div>
      <span className={styles.calculationBadge}><Gauge /> Предварительный расчёт</span>
    </header>

    <div className={styles.scenarioGroups}>
      {(["PvE", "PvP"] as const).map((group) => <div key={group} className={styles.scenarioGroup} role="group" aria-label={`Режимы ${group}`}>
        <b>{group}</b>
        <div>{talentScenarios.filter((scenario) => scenario.group === group).map((scenario) => <button key={scenario.id} type="button" aria-pressed={selected === scenario.id} onClick={() => onSelect(scenario.id)}><span>{scenario.shortLabel}</span><small>{scenario.label}</small></button>)}</div>
      </div>)}
    </div>

    <div className={styles.scenarioSummary}>
      <div className={styles.scenarioGoal}><small>Цель билда</small><strong>{audit.scenario.goal}</strong><p>{audit.verdict}</p></div>
      <div className={styles.scenarioAssumptions}><small>Что заложено в расчёт</small>{audit.assumptions.map((assumption) => <span key={assumption}><Check />{assumption}</span>)}</div>
      <div className={styles.buildScore} aria-label={`Оценка билда: сейчас ${audit.currentScore}, после изменений ${audit.recommendedScore} из 100`}>
        <small>Соответствие режиму</small>
        <div><span><em>Сейчас</em><b>{audit.currentScore}</b></span><ChevronRight /><span><em>После замен</em><b>{audit.recommendedScore}</b></span></div>
        <p>Ожидаемо <strong>+{totalGain.toFixed(1)}% {audit.metricLabel}</strong></p>
      </div>
    </div>

    <div className={styles.swapGuide}>
      <header><span>Сделайте сначала эти замены</span><small>Каждая карточка отвечает на три вопроса: что плохо, почему и что получите.</small></header>
      {audit.changes.map((change, index) => <article key={`${audit.scenario.id}-${change.from}-${change.to}`}>
        <span className={styles.swapNumber}>{index + 1}</span>
        <div className={styles.swapTalents}><span><small>Убрать</small><b>{change.from}</b></span><ChevronRight /><span><small>Поставить</small><b>{change.to}</b></span></div>
        <div className={styles.swapExplanation}><p><AlertTriangle /><span><b>Почему сейчас плохо</b>{change.problem}</span></p><p><CircleHelp /><span><b>Почему замена лучше</b>{change.reason}</span></p><p><Check /><span><b>Что изменится в игре</b>{change.outcome}</span></p></div>
        <em>+{change.gain.toFixed(1)}% {audit.metricLabel}</em>
      </article>)}
    </div>

    <footer className={styles.talentLabNote}><ShieldCheck /><span><b>{dataMode === "battle-net" ? "Сейчас показана UX-модель анализа." : "Демонстрационный расчёт."}</b> Числа станут боевым расчётом после подключения фактического дерева талантов, актуальных билдов патча и симуляции выбранного сценария.</span></footer>
  </section>;
}

function TalentTree({ label, nodes }: { label: string; nodes: CharacterTalentNode[] }) {
  return <div className={styles.tree}><small>{label}</small><div>{nodes.map((node, index) => <WarcraftTooltip key={`${node.name}-${index}`} content={<div className={styles.talentTooltipContent}><small>{node.issue ? "Конфликт билда" : "Талант в билде"}</small><strong>{node.name}</strong><p>{node.description}</p></div>}><i tabIndex={0} role="img" aria-label={node.name} className={node.issue ? styles.treeIssue : ""}><img src={node.iconUrl} alt="" /></i></WarcraftTooltip>)}</div></div>;
}

function StatBalance({ primaryStat, priority }: { primaryStat: string; priority: string }) {
  const [expanded, setExpanded] = useState(true);
  return <section className={`${styles.balance} ${expanded ? "" : styles.balanceCompact}`} id="audit-stats"><h2>Баланс характеристик <HelpTip title="Вес характеристик">Диапазоны рассчитаны для текущей экипировки. Красная шкала показывает характеристику вне рекомендуемого коридора.</HelpTip><button aria-pressed={expanded} onClick={() => setExpanded((value) => !value)} type="button">Разбивка<ChevronRight /></button></h2><p className={styles.statPriority}>Приоритет специализации <b>{priority}</b></p>{auditStats(primaryStat).map(([name, value, width, warn]) => <div key={name}><span>{name}</span><b>{value}</b><i><em style={{ width }} className={warn ? styles.warn : ""} /></i><small>{warn ? "20,0%–22,0%" : "Оптимальный диапазон"}</small>{warn ? <AlertTriangle /> : <Check />}</div>)}</section>;
}

function Readiness({ label, value, state, warn }: { label: string; value: string; state: string; warn?: boolean }) {
  return <div><span>{label}</span><i><b style={{ width: value }} /></i><small className={warn ? styles.readinessWarn : ""}>{state}</small>{warn ? <AlertTriangle /> : <Check />}</div>;
}
