"use client";

import dynamic from "next/dynamic";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ChevronDown, CircleHelp, Info, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { RotationAbility, RotationAplRule, RotationPreset, RotationScenario, RotationSimulationResult, SavedRotationCombo } from "@/lib/platform/rotation/types";
import { priorityToAplRules } from "@/lib/platform/rotation/apl";
import { localizeRotationResult, mergeRotationAbility, rotationComboName } from "@/lib/platform/rotation/locale";
import { AbilityIcon } from "./AbilityIcon";
import type { RotationEncounterTemplate } from "./CombatActionBar";
import { RotationSpecMenu } from "./RotationSpecMenu";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { characterStorageScope, withCharacterContext } from "@/lib/platform/rotation/characterRequestContext";
import { recordCharacterRun } from "@/lib/wow/characterRunHistory";
import { RotationCursorProvider, RotationCursorValueContext, useRotationCursorUpdate } from "./rotationCursorContext";
import styles from "./rotationLab.module.css";
import identityStyles from "./rotationSpecIdentity.module.css";
import spread from "./rotationBookSpread.module.css";
import motion from "./rotationMotion.module.css";

function BookFoldout({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? <div className={spread.foldout} data-book-surface="foldout">{children}</div> : <>{children}</>;
}

function DeferredMount({ children, placeholder, className, rootMargin = "0px", waitForScrollIdleMs = 0 }: { children: ReactNode; placeholder: ReactNode; className?: string; rootMargin?: string; waitForScrollIdleMs?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let scrollIdleTimer = 0;
    let cancelled = false;
    let removeScrollIdleListener = () => {};
    const mount = () => {
      if (!waitForScrollIdleMs) {
        startTransition(() => setMounted(true));
        return;
      }
      const mountAfterIdle = () => {
        window.clearTimeout(scrollIdleTimer);
        scrollIdleTimer = window.setTimeout(() => {
          window.removeEventListener("scroll", mountAfterIdle);
          if (!cancelled) startTransition(() => setMounted(true));
        }, waitForScrollIdleMs);
      };
      window.addEventListener("scroll", mountAfterIdle, { passive: true });
      removeScrollIdleListener = () => window.removeEventListener("scroll", mountAfterIdle);
      mountAfterIdle();
    };
    if (!("IntersectionObserver" in window)) {
      mount();
      return () => {
        cancelled = true;
        window.clearTimeout(scrollIdleTimer);
        removeScrollIdleListener();
      };
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      mount();
    }, { rootMargin });
    observer.observe(container);
    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearTimeout(scrollIdleTimer);
      removeScrollIdleListener();
    };
  }, [rootMargin, waitForScrollIdleMs]);
  return <div ref={containerRef} className={className}>{mounted ? children : placeholder}</div>;
}

const RotationTimeline = dynamic(() => import("./RotationTimeline"), {
  loading: () => <div className={styles.timelineSkeleton} aria-busy="true"><i /><i /><i /><i /></div>,
});
const BuildOptimizer = dynamic(() => import("./BuildOptimizer").then((module) => module.BuildOptimizer));
const CombatActionBar = dynamic(() => import("./CombatActionBar").then((module) => module.CombatActionBar), {
  loading: () => <div className={styles.combatDeckPlaceholder} aria-busy="true" />,
});
const PriorityEditor = dynamic(() => import("./PriorityEditor").then((module) => module.PriorityEditor), {
  loading: () => <div className={styles.priorityPlaceholder} aria-busy="true" />,
});
const RotationTrainer = dynamic(() => import("./RotationTrainer").then((module) => module.RotationTrainer));
const RotationLabGuide = dynamic(() => import("./RotationLabGuide").then((module) => module.RotationLabGuide));
const RotationResultGuide = dynamic(() => import("./RotationResultGuide").then((module) => module.RotationResultGuide));
const MetricCards = dynamic(() => import("./MetricCards").then((module) => module.MetricCards));
const CombatStateInspector = dynamic(() => import("./CombatStateInspector").then((module) => module.CombatStateInspector));
const FindingsPanel = dynamic(() => import("./FindingsPanel").then((module) => module.FindingsPanel));

const scenarios: RotationScenario[] = ["single-target", "aoe", "execute"];
type LabMode = "simulation" | "training";
type AnalysisView = "timeline" | "priority" | "opener";
type SimulationConfig = { scenario: RotationScenario; fightLength: number; targets: number; rules: string[]; aplRules: RotationAplRule[]; talentLoadout?: string };

function configsMatch(a: SimulationConfig | null, b: SimulationConfig) {
  return Boolean(a && a.scenario === b.scenario && a.fightLength === b.fightLength && a.targets === b.targets && JSON.stringify(a.aplRules) === JSON.stringify(b.aplRules) && (a.talentLoadout ?? "") === (b.talentLoadout ?? ""));
}

function simulationErrorMessage(message: string, tr: (value: string) => string, lang: Lang) {
  const normalized = message.toLowerCase();
  if (normalized.includes("healer") || normalized.includes("hps") || normalized.includes("unsupported_combat_model")) {
    return lang === "ru" ? "Для лекарей нужен отдельный расчёт HPS и приоритетов лечения. Поддельный DPS здесь не показываем." : "Healers require a dedicated HPS and healing-priority model. We do not show fake DPS here.";
  }
  if (normalized.includes("temporarily_unavailable") || normalized.includes("unavailable") || normalized.includes("503")) {
    return tr("Simulation engine is temporarily unavailable.");
  }
  if (normalized.includes("busy")) return tr("SimulationCraft worker is busy");
  if (normalized.includes("rate") || normalized.includes("429")) return tr("Too many simulation requests. Try again in a minute.");
  return tr("Simulation failed. Try again.");
}

function SimulationResultSkeleton({ tr }: { tr: (value: string) => string }) {
  return (
    <section className={styles.resultSkeleton} aria-busy="true" aria-live="polite">
      <div><span>{tr("SimulationCraft is calculating your result")}</span></div>
      <div className={styles.resultSkeletonBody}><i /><i /><i /><i /></div>
    </section>
  );
}

type RotationLabPageProps = {
  preset: RotationPreset;
  spellbookAbilities?: RotationAbility[];
  lang: Lang;
  characterSlug?: string;
  dataMode?: "fixture" | "battle-net";
  connectedTalentLoadout?: string;
  profileFingerprint?: string;
  onSimulationResult?: (result: RotationSimulationResult) => void;
  embedded?: boolean;
  characterIdentity?: { name: string; itemLevel: number };
};

export function RotationLabPage(props: RotationLabPageProps) {
  return <RotationCursorProvider><RotationLabPageContent {...props} /></RotationCursorProvider>;
}

function RotationLabPageContent({ preset, spellbookAbilities = [], lang, characterSlug, dataMode = "battle-net", connectedTalentLoadout, profileFingerprint = "initial", onSimulationResult, embedded = false, characterIdentity }: RotationLabPageProps) {
  const tr = t(lang);
  const [labMode, setLabMode] = useState<LabMode>("simulation");
  const [scenario, setScenario] = useState<RotationScenario>("single-target");
  const [fightLength, setFightLength] = useState(120);
  const [targets, setTargets] = useState(1);
  const [rules, setRules] = useState(preset.defaultRules);
  const [aplRules, setAplRules] = useState<RotationAplRule[]>(preset.defaultAplRules ?? priorityToAplRules(preset.defaultRules, "maintained"));
  const [activeTalentLoadout, setActiveTalentLoadout] = useState("");
  const [result, setResult] = useState<RotationSimulationResult | null>(null);
  const [lastRunConfig, setLastRunConfig] = useState<SimulationConfig | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState("");
  const setCursor = useRotationCursorUpdate();
  const resetPresetSlug = useRef(preset.slug);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [analysisView, setAnalysisView] = useState<AnalysisView>("priority");
  const [compactAnalysis, setCompactAnalysis] = useState(false);
  const [trainingActive, setTrainingActive] = useState(false);
  const [selectedCombo, setSelectedCombo] = useState<SavedRotationCombo | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const theme = getTalentSpecTheme(preset.slug);
  const connectedEmbed = embedded && dataMode === "battle-net";
  useEffect(() => {
    const media = window.matchMedia("(max-width: 960px)");
    const sync = () => setCompactAnalysis(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const identityMeta = connectedEmbed
    ? [
        `${tr("Patch")} ${preset.patch}`,
        characterIdentity?.name?.trim(),
        characterIdentity && Number.isFinite(characterIdentity.itemLevel) && characterIdentity.itemLevel > 0
          ? `${characterIdentity.itemLevel} ilvl`
          : undefined,
      ].filter(Boolean).join(" · ")
    : `${tr("Patch")} ${preset.patch} · ${preset.character.name} · ${preset.character.itemLevel} ilvl`;
  const rotationStyle = theme ? {
    "--rotation-accent": theme.accent,
    "--rotation-hot": theme.hot,
    "--rotation-deep": theme.deep,
    "--rotation-accent-rgb": theme.accentRgb,
    "--rotation-hot-rgb": theme.hotRgb,
    "--rotation-ambient-rgb": theme.ambientRgb,
  } as CSSProperties : undefined;
  const requestId = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const displayAbilities = useMemo(() => {
    const catalog = new Map<string, RotationAbility>([...preset.abilities, ...spellbookAbilities].map((ability) => [ability.id, ability]));
    for (const ability of [...(selectedCombo?.abilities ?? []), ...(result?.abilities ?? [])]) {
      const existing = catalog.get(ability.id);
      const incomingIcon = ability.iconUrl && ability.iconUrl !== preset.character.iconUrl ? ability.iconUrl : "";
      catalog.set(ability.id, { ...mergeRotationAbility(existing, ability), iconUrl: incomingIcon || existing?.iconUrl || preset.character.iconUrl });
    }
    return [...catalog.values()];
  }, [preset.abilities, preset.character.iconUrl, result?.abilities, selectedCombo?.abilities, spellbookAbilities]);
  const byId = useMemo(() => new Map(displayAbilities.map((ability) => [ability.id, ability])), [displayAbilities]);
  const displayResult = useMemo(() => result ? localizeRotationResult(result, displayAbilities, lang, preset.gameLabels) : null, [displayAbilities, lang, preset.gameLabels, result]);
  const selectedComboName = selectedCombo ? rotationComboName(selectedCombo, lang) : undefined;
  const currentConfig = useMemo<SimulationConfig>(() => ({ scenario, fightLength, targets, rules, aplRules, talentLoadout: activeTalentLoadout || undefined }), [activeTalentLoadout, aplRules, fightLength, rules, scenario, targets]);
  const isDirty = Boolean(result && !configsMatch(lastRunConfig, currentConfig));

  useEffect(() => {
    if (!result) return;
    const analysis = document.getElementById("rotation-advanced-analysis");
    if (analysis instanceof HTMLDetailsElement) analysis.open = true;
  }, [result]);

  const run = useCallback(async (override?: SimulationConfig) => {
    const input = override ?? currentConfig;
    const id = ++requestId.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setStatus("running");
    setError("");
    try {
      let response: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        response = await fetch("/api/platform/rotation/simulations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(withCharacterContext({ spec: preset.slug, scenario: input.scenario, fightLengthSeconds: input.fightLength, targets: input.targets, rules: input.rules, aplRules: input.aplRules, ...(input.talentLoadout ? { talentLoadout: input.talentLoadout } : {}) }, characterSlug, dataMode)),
          signal: controller.signal,
        });
        if (![429, 503].includes(response.status) || attempt === 2) break;
        const seconds = Math.min(2, Math.max(.25, Number(response.headers.get("retry-after") ?? .5)));
        await new Promise((resolve) => window.setTimeout(resolve, seconds * 1000));
      }
      if (!response?.ok) {
        const payload = await response?.json().catch(() => null) as { error?: string; message?: string } | null;
        throw new Error(payload?.error || payload?.message || "Simulation failed. Try again.");
      }
      const payload = await response.json() as RotationSimulationResult;
      if (requestId.current !== id) return;
      setResult(payload);
      setSelectedCombo(null);
      setLastRunConfig({ ...input, rules: [...input.rules], aplRules: structuredClone(input.aplRules) });
      setCursor(Math.min(payload.findings[0]?.time ?? 0, payload.fightLengthSeconds));
      setLastRunAt(Date.now());
      setStatus("idle");
      onSimulationResult?.(payload);
      if (characterSlug && dataMode === "battle-net") void recordCharacterRun(characterSlug, preset.slug, {
        kind: "rotation", gameBuild: preset.patch || "unknown", profileFingerprint,
        scenario: { id: payload.scenario, durationSeconds: payload.fightLengthSeconds, targets: payload.targets },
        engine: payload.engine, metrics: { dps: payload.dps, deltaPercent: payload.baselineDelta, confidence: payload.confidence, iterations: payload.iterations },
        label: `${lang === "ru" ? "Ротация" : "Rotation"} · ${payload.scenario}`,
      }).catch(() => undefined);
    } catch (reason) {
      if (controller.signal.aborted || requestId.current !== id) return;
      setError(reason instanceof Error ? reason.message : "Simulation failed. Try again.");
      setStatus("error");
    } finally {
      if (requestId.current === id) requestController.current = null;
    }
  }, [characterSlug, currentConfig, dataMode, lang, onSimulationResult, preset.patch, preset.slug, profileFingerprint]);

  useEffect(() => () => requestController.current?.abort(), []);
  useEffect(() => {
    if (resetPresetSlug.current === preset.slug) return;
    resetPresetSlug.current = preset.slug;
    requestController.current?.abort();
    setRules([...preset.defaultRules]);
    setAplRules(structuredClone(preset.defaultAplRules ?? priorityToAplRules(preset.defaultRules, "maintained")));
    setActiveTalentLoadout("");
    setResult(null);
    setLastRunConfig(null);
    setSelectedCombo(null);
    setScenario("single-target");
    setFightLength(120);
    setTargets(1);
    setStatus("idle");
    setError("");
    setTrainingActive(false);
  }, [preset.slug]);
  useEffect(() => {
    if (connectedTalentLoadout) setActiveTalentLoadout(connectedTalentLoadout);
  }, [connectedTalentLoadout]);
  useEffect(() => {
    if (window.localStorage.getItem("gildra.rotation-guide.dismissed") === "1") setGuideOpen(false);
  }, []);

  const reset = (priorityOnly = false) => {
    const baseline: SimulationConfig = {
      scenario: priorityOnly ? scenario : "single-target",
      fightLength: priorityOnly ? fightLength : 120,
      targets: priorityOnly ? targets : 1,
      rules: [...preset.defaultRules],
      aplRules: structuredClone(preset.defaultAplRules ?? priorityToAplRules(preset.defaultRules, "maintained")),
      talentLoadout: activeTalentLoadout || undefined,
    };
    setScenario(baseline.scenario);
    setFightLength(baseline.fightLength);
    setTargets(baseline.targets);
    setRules(baseline.rules);
    setAplRules(baseline.aplRules);
    void run(baseline);
  };
  const chooseScenario = (value: RotationScenario) => {
    setScenario(value);
    setTargets((current) => value === "aoe" ? Math.max(3, current) : 1);
  };
  const chooseEncounter = (template: RotationEncounterTemplate) => {
    setScenario(template.scenario);
    setTargets(template.targets);
    setFightLength(template.fightLength);
  };
  const liveReference = result?.engine.startsWith("SimulationCraft") ? result : null;
  const personalReference = result?.accuracy?.mode === "simulationcraft-armory";
  const staleResult = Boolean(result && (isDirty || status === "error"));
  const opener = useMemo(() => {
    const castIds = result?.recommendedSequence?.slice(0, 8) ?? result?.casts.filter((cast) => cast.lane === "global").slice(0, 8).map((cast) => cast.abilityId) ?? [];
    return (castIds.length ? castIds : rules.slice(0, 8)).map((id) => byId.get(id)).filter(Boolean);
  }, [byId, result, rules]);
  const selectFinding = (time: number) => {
    setCursor(time);
    setAnalysisView("timeline");
    window.setTimeout(() => document.getElementById("rotation-timeline")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  };
  const closeGuide = () => {
    setGuideOpen(false);
    window.localStorage.setItem("gildra.rotation-guide.dismissed", "1");
  };
  const showSimulation = () => {
    setLabMode("simulation");
    closeGuide();
    window.setTimeout(() => document.getElementById("build-studio-title")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };
  const showTraining = () => {
    setLabMode("training");
    closeGuide();
    window.setTimeout(() => document.getElementById("rotation-trainer")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };
  const useCombo = (combo: SavedRotationCombo) => {
    setSelectedCombo(combo);
    setRules([...combo.rules]);
    setAplRules(structuredClone(combo.aplRules ?? priorityToAplRules(combo.rules)));
    setLabMode("training");
    closeGuide();
    window.setTimeout(() => document.getElementById("rotation-trainer")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };
  const acceptOptimized = (optimized: RotationSimulationResult, combo: SavedRotationCombo) => {
    const optimizedApl = structuredClone(combo.aplRules ?? priorityToAplRules(combo.rules));
    const optimizedConfig = { scenario: combo.scenario, fightLength: optimized.fightLengthSeconds, targets: optimized.targets, rules: [...combo.rules], aplRules: optimizedApl, talentLoadout: activeTalentLoadout || undefined };
    setRules([...combo.rules]);
    setAplRules(optimizedApl);
    setResult(optimized);
    setLastRunConfig(optimizedConfig);
    setSelectedCombo(combo);
    setCursor(Math.min(optimized.findings[0]?.time ?? 0, optimized.fightLengthSeconds));
    setLastRunAt(Date.now());
    onSimulationResult?.(optimized);
    if (characterSlug && dataMode === "battle-net") void recordCharacterRun(characterSlug, preset.slug, {
      kind: "rotation", gameBuild: preset.patch || "unknown", profileFingerprint,
      scenario: { id: optimized.scenario, durationSeconds: optimized.fightLengthSeconds, targets: optimized.targets },
      engine: optimized.engine, metrics: { dps: optimized.dps, deltaPercent: optimized.baselineDelta, confidence: optimized.confidence, iterations: optimized.iterations },
      label: `${lang === "ru" ? "Оптимизированная ротация" : "Optimized rotation"} · ${optimized.scenario}`,
    }).catch(() => undefined);
  };
  const changePriority = (nextRules: string[]) => {
    const existing = new Map(aplRules.map((rule) => [rule.abilityId, rule]));
    setRules(nextRules);
    setAplRules(nextRules.map((abilityId, index) => existing.get(abilityId) ?? { id: `custom-${index}-${abilityId}`, abilityId, conditions: [], source: "custom" }));
  };
  const changeApl = (next: RotationAplRule[]) => {
    setAplRules(next);
    setRules(next.map((rule) => rule.abilityId));
  };
  const Root = embedded ? "section" : "main";
  return (
    <Root id="rotation-lab-content" data-spec={preset.slug} style={rotationStyle} className={`${styles.lab} ${styles.furyLab} ${embedded ? styles.embeddedLab : ""} ${trainingActive ? styles.labTrainingActive : ""} ${connectedEmbed ? `${spread.bookSpread} ${motion.motion}` : ""}`}>
      <section className={`${styles.hero} ${styles.simpleHero} ${connectedEmbed ? `${identityStyles.identityHero} ${spread.leafPair}` : ""}`}>
        <div className={`${styles.specPicker} ${connectedEmbed ? identityStyles.specIdentity : ""}`}>
          <img src={preset.character.iconUrl} alt="" width="72" height="72" />
          {embedded ? <strong className={styles.embeddedCharacter}>{lang === "ru" ? theme?.specNameRu ?? preset.specialization : theme?.specName ?? preset.specialization}</strong> : <RotationSpecMenu activeSlug={preset.slug} lang={lang} />}
          <small>{identityMeta}</small>
        </div>
        <div className={styles.titleBlock}>
          <span className={styles.eyebrow}>{theme ? `${lang === "ru" ? theme.classNameRu : theme.className} · ${lang === "ru" ? theme.roleRu : theme.role}`.toUpperCase() : preset.className.toUpperCase()} · {lang === "ru" ? "БОЕВАЯ ПОДГОТОВКА" : "COMBAT TRAINING"}</span>
          <div className={styles.titleRow}>{embedded ? <strong className={styles.embeddedHeroTitle}>{lang === "ru" ? "Ротация и урон" : "Rotation and damage"}</strong> : <h1>{lang === "ru" ? `Тренер ротации «${theme?.specNameRu ?? preset.specialization}»` : `${theme?.specName ?? preset.specialization} Rotation Coach`}</h1>}<button type="button" className={styles.guideButton} aria-expanded={guideOpen} onClick={() => setGuideOpen(true)}><CircleHelp /> {lang === "ru" ? "Что это?" : "What is this?"}</button></div>
          <p>{labMode === "simulation" ? (characterSlug && dataMode === "battle-net" ? (lang === "ru" ? "Экипировка и таланты персонажа подключены. Выберите умения и рассчитайте урон." : "Your character's gear and talents are connected. Choose abilities and calculate damage.") : (lang === "ru" ? "Получите готовый прокаст под билд и отработайте его на клавиатуре." : "Get a build-specific combo and practice it on your keyboard.")) : (lang === "ru" ? "Повторяйте подсвеченные умения: увидите точность, темп и примерный урон." : "Follow the highlighted abilities to see accuracy, pace, and estimated damage.")}</p>
        </div>
      </section>

      {guideOpen && <BookFoldout enabled={connectedEmbed}><RotationLabGuide lang={lang} open={guideOpen} busy={status === "running"} hasResult={Boolean(result)} onClose={closeGuide} onSimulation={showSimulation} onTraining={showTraining} /></BookFoldout>}

      {labMode === "training" ? (
        <div id="lab-training-panel">
          <section className={`${styles.trainingIntro} ${connectedEmbed ? spread.leafPair : ""}`}>
            <button type="button" onClick={showSimulation}><ArrowLeft /> {lang === "ru" ? "Назад к выбору прокаста" : "Back to combo selection"}</button>
            <div><span>{lang === "ru" ? "СЕЙЧАС ТРЕНИРУЕМ" : "CURRENT DRILL"}</span><strong>{selectedComboName ?? (lang === "ru" ? `Учебная ротация: ${theme?.specNameRu ?? preset.specialization}` : `${theme?.specName ?? preset.specialization} practice rotation`)}</strong><small>{lang === "ru" ? "Сначала проверь клавиши, потом нажми «Начать тренировку»." : "Check your keybinds, then press Start Training."}</small></div>
          </section>
          <BookFoldout enabled={connectedEmbed}><RotationTrainer
            abilities={displayAbilities}
            rules={rules}
            slug={preset.slug}
            lang={lang}
            storageScope={characterStorageScope(characterSlug, dataMode)}
            characterSlug={characterSlug}
            dataMode={dataMode}
            referenceDps={(selectedCombo?.dps ?? 0) > 0 ? selectedCombo?.dps : liveReference?.dps}
            referenceApm={liveReference?.castsPerMinute}
            referenceSequence={liveReference?.recommendedSequence ?? liveReference?.casts.filter((cast) => cast.lane === "global").map((cast) => cast.abilityId)}
            referenceSequenceSource="simulation-trace"
            comboSequence={selectedCombo?.sequence}
            comboSequenceSource={selectedCombo?.sequenceSource ?? (selectedCombo?.engine === "imported-tag" ? "imported-tag" : "saved-combo")}
            comboName={selectedComboName}
            onActiveChange={setTrainingActive}
          /></BookFoldout>
        </div>
      ) : <div id="lab-simulation-panel">
        <BookFoldout enabled={connectedEmbed}><BuildOptimizer slug={preset.slug} specialization={lang === "ru" ? (theme?.specNameRu ?? preset.specialization) : (theme?.specName ?? preset.specialization)} lang={lang} abilities={displayAbilities} scenario={scenario} fightLength={fightLength} targets={targets} rules={rules} aplRules={aplRules} characterSlug={characterSlug} dataMode={dataMode} connectedTalentLoadout={connectedTalentLoadout} embedded={embedded} currentResult={result} resultMatchesCurrent={!isDirty} onScenarioChange={chooseScenario} onFightLengthChange={setFightLength} onTargetsChange={setTargets} onTalentLoadoutChange={setActiveTalentLoadout} onOptimized={acceptOptimized} onUseCombo={useCombo} /></BookFoldout>

        <details id="rotation-advanced-analysis" className={`${styles.advancedLab} ${connectedEmbed ? motion.chapter : ""}`} open>
          <summary className={connectedEmbed ? spread.chapterSummary : undefined}><SlidersHorizontal /><span><strong>{lang === "ru" ? "Панель ротации и расчёт DPS" : "Rotation panel and DPS simulation"}</strong><small>{lang === "ru" ? "Порядок важен: верхние умения проверяются первыми" : "Order matters: abilities at the top are checked first"}</small></span><ChevronDown /></summary>
          <div className={styles.advancedBody}>
            <div id="rotation-simulation-controls" className={`${styles.controls} ${connectedEmbed ? `${spread.foldout} ${spread.controlsSheet}` : ""}`} data-book-surface={connectedEmbed ? "foldout" : undefined}>
              <div className={styles.scenarioTabs} role="radiogroup" aria-label={tr("Scenario")}>{scenarios.map((item) => <button key={item} role="radio" aria-checked={scenario === item} className={scenario === item ? styles.active : ""} disabled={status === "running"} onClick={() => chooseScenario(item)}>{item === "single-target" ? tr("Single Target") : item === "aoe" ? (lang === "ru" ? "Пачка" : "AoE") : (lang === "ru" ? "Добить" : "Execute")}</button>)}</div>
              <label><span>{tr("Fight Length")}</span><select value={fightLength} disabled={status === "running"} onChange={(event) => setFightLength(Number(event.target.value))}><option value="60">1:00</option><option value="120">2:00</option><option value="180">3:00</option><option value="300">5:00</option></select></label>
              <label><span>{tr("Targets")}</span><select value={targets} disabled={status === "running" || scenario !== "aoe"} onChange={(event) => setTargets(Number(event.target.value))}>{[1, 2, 3, 5, 8].map((value) => <option key={value}>{value}</option>)}</select></label>
              <button className={styles.resetButton} onClick={() => reset()} disabled={status === "running"}><RotateCcw /> {tr("Reset")}</button>
              <button className={styles.simulateButton} onClick={() => void run()} disabled={status === "running"}><Play /> {status === "running" ? tr("Simulating") : tr("Start Simulation")}</button>
            </div>
            {status === "running" && <div className={styles.progress} role="progressbar" aria-label={tr("Simulation progress")} aria-valuetext={tr("SimulationCraft is calculating your result")}><span /></div>}
            <DeferredMount rootMargin="-120px 0px" waitForScrollIdleMs={700} placeholder={<div className={styles.combatDeckPlaceholder} aria-busy="true" />}>
              <CombatActionBar abilities={displayAbilities} rules={rules} result={displayResult} scenario={scenario} targets={targets} fightLength={fightLength} lang={lang} busy={status === "running"} stale={staleResult} slug={preset.slug} storageScope={characterStorageScope(characterSlug, dataMode)} characterSlug={characterSlug} dataMode={dataMode} manuscript={connectedEmbed} onCursor={setCursor} onRun={() => void run()} onEncounter={chooseEncounter} />
            </DeferredMount>
            {error && <BookFoldout enabled={connectedEmbed}><div className={styles.simulationError} role="alert"><AlertTriangle /><span><strong>{tr("Simulation unavailable")}</strong>{simulationErrorMessage(error, tr, lang)}</span><button onClick={() => void run()}>{tr("Try again")}</button></div></BookFoldout>}
            {isDirty && <BookFoldout enabled={connectedEmbed}><div className={styles.staleResult} role="status"><Info /><span><strong>{tr("Changes not simulated")}</strong>{tr("The result below belongs to the previous settings.")}</span><button onClick={() => void run()} disabled={status === "running"}>{tr("Simulate changes")}</button></div></BookFoldout>}
            <BookFoldout enabled={connectedEmbed}>{displayResult ? <div id="rotation-result" className={staleResult ? styles.resultStale : ""}>{staleResult && <div className={styles.staleBadge}><Info /> {tr("Previous successful result")}</div>}<RotationResultGuide lang={lang} result={displayResult} onFinding={selectFinding} onTraining={showTraining} /><MetricCards result={displayResult} lang={lang} stale={staleResult} lastRunAt={lastRunAt} /><RotationCursorValueContext.Consumer>{(cursor) => <CombatStateInspector result={displayResult} lang={lang} cursor={cursor} onCursor={setCursor} />}</RotationCursorValueContext.Consumer><RotationCursorValueContext.Consumer>{(cursor) => <FindingsPanel findings={displayResult.findings} lang={lang} onSelect={selectFinding} selectedTime={cursor} />}</RotationCursorValueContext.Consumer></div> : status === "running" ? <SimulationResultSkeleton tr={tr} /> : <div className={styles.advancedEmpty}><Info /><span><strong>{lang === "ru" ? "Сначала рассчитай прокаст выше" : "Calculate a combo above first"}</strong><small>{lang === "ru" ? "После расчёта здесь появятся подробные метрики и таймлайн." : "Detailed metrics and the timeline will appear here."}</small></span></div>}</BookFoldout>
            <BookFoldout enabled={connectedEmbed}><nav className={styles.analysisTabs} aria-label={tr("Analysis sections")}>{(["timeline", "priority", "opener"] as const).map((view) => <button key={view} aria-pressed={analysisView === view} onClick={() => setAnalysisView(view)}>{tr(view === "timeline" ? "Timeline" : view === "priority" ? "Priority" : "Opener")}</button>)}</nav>
            <div className={styles.analysisWorkspace} data-view={analysisView} aria-busy={status === "running"}>
              <div className={`${styles.analysisPane} ${styles.priorityPane} ${analysisView === "priority" ? styles.analysisPaneActive : ""}`}><DeferredMount className={styles.deferredPriority} rootMargin="400px 0px" waitForScrollIdleMs={700} placeholder={<div className={styles.priorityPlaceholder} aria-busy="true" />}><PriorityEditor abilities={displayAbilities} rules={rules} aplRules={aplRules} aplOptions={preset.aplOptions ?? { resources: [], buffs: [], cooldowns: preset.defaultRules }} sourceLabel={preset.aplSource?.label ?? preset.engineLabel} defaults={preset.defaultRules} lang={lang} onChange={changePriority} onAplChange={changeApl} onReset={() => reset(true)} interactionsDisabled={status === "running"} /></DeferredMount></div>
              <div className={`${styles.analysisPane} ${styles.timelinePane} ${analysisView === "timeline" ? styles.analysisPaneActive : ""}`}>{displayResult ? compactAnalysis && analysisView !== "timeline" ? <div className={styles.timelineSkeleton} aria-hidden="true"><i /><i /><i /><i /></div> : <DeferredMount rootMargin="240px 0px" waitForScrollIdleMs={700} placeholder={<div className={styles.timelineSkeleton} aria-busy="true"><i /><i /><i /><i /></div>}><RotationCursorValueContext.Consumer>{(cursor) => <RotationTimeline result={displayResult} abilities={displayAbilities} lang={lang} cursor={cursor} onCursor={setCursor} />}</RotationCursorValueContext.Consumer></DeferredMount> : <div className={styles.timelineSkeleton} aria-busy="true"><span>{lang === "ru" ? "Таймлайн появится после расчёта" : "Timeline appears after calculation"}</span><i /><i /><i /><i /></div>}</div>
              <details className={`${styles.analysisPane} ${styles.openerPreview} ${analysisView === "opener" ? styles.analysisPaneActive : ""} ${connectedEmbed ? motion.chapter : ""}`}><summary><span>{tr("Opening sequence")}</span><small>{tr("First actions from the simulation")}</small><ChevronDown /></summary><ol>{opener.map((ability, index) => ability ? <li key={`${ability.id}-${index}`}><b>{index + 1}</b><AbilityIcon ability={ability} /><span>{ability.name}</span><i aria-hidden="true">›</i></li> : null)}</ol></details>
            </div></BookFoldout>
            <p className={`${styles.modelNotice} ${connectedEmbed ? spread.leafNotes : ""}`}><Info aria-hidden="true" /> {personalReference ? (lang === "ru" ? "SimulationCraft рассчитал DPS, кулдауны, ресурсы и проки по последнему снимку этого персонажа из Battle.net." : "SimulationCraft calculated DPS, cooldowns, resources, and procs from this character's latest Battle.net snapshot.") : liveReference ? (lang === "ru" ? "SimulationCraft рассчитал механику на эталонном профиле специализации. Подключите персонажа для персонального DPS." : "SimulationCraft calculated mechanics on the specialization reference profile. Connect a character for personal DPS.") : (lang === "ru" ? "Точного результата нет: упрощённую оценку не выдаём за SimulationCraft." : "No exact result is available; a simplified estimate is never presented as SimulationCraft.")}</p>
          </div>
        </details>
      </div>}
    </Root>
  );
}
