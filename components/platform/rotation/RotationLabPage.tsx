"use client";

import dynamic from "next/dynamic";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BarChart3, ChevronDown, Dumbbell, Info, Play, RotateCcw } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasNotice } from "@gildra/atlas-ui/AtlasNotice";
import type { Lang } from "@/lib/i18n";
import { rotationT as t } from "@/lib/platform/rotation/rotationDictionary";
import type { RotationAbility, RotationAplRule, RotationPreset, RotationScenario, RotationSimulationResult, SavedRotationCombo } from "@/lib/platform/rotation/types";
import { priorityToAplRules } from "@/lib/platform/rotation/apl";
import { localizeRotationResult, mergeRotationAbility, rotationComboName } from "@/lib/platform/rotation/locale";
import { AbilityIcon } from "./AbilityIcon";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { characterStorageScope, withCharacterContext } from "@/lib/platform/rotation/characterRequestContext";
import { recordCharacterRun } from "@/lib/wow/characterRunHistory";
import { RotationCursorProvider, RotationCursorValueContext, useRotationCursorUpdate } from "./rotationCursorContext";
import { rotationLabCopy } from "./rotationLabCopy";
import styles from "./rotationLab.module.css";
import identityStyles from "./rotationSpecIdentity.module.css";
import spread from "./rotationBookSpread.module.css";
import motion from "./rotationMotion.module.css";
import shell from "./rotationLabShell.module.css";

/** The character profile prints the lab on book foldouts; the standalone page needs no wrapper. */
function BookFoldout({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? <div className={spread.foldout} data-atlas-surface="foldout">{children}</div> : <>{children}</>;
}

/** Mounts heavy widgets once they come within `rootMargin` of the viewport; the placeholder is a short dashed box. */
function DeferredMount({ children, placeholder, className, rootMargin = "0px" }: { children: ReactNode; placeholder: ReactNode; className?: string; rootMargin?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const mount = () => startTransition(() => setMounted(true));
    if (!("IntersectionObserver" in window)) {
      mount();
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      mount();
    }, { rootMargin });
    observer.observe(container);
    return () => observer.disconnect();
  }, [rootMargin]);
  return <div ref={containerRef} className={className}>{mounted ? children : placeholder}</div>;
}

const placeholder = () => <div className={shell.placeholder} aria-busy="true" />;
const RotationTimeline = dynamic(() => import("./RotationTimeline"), { loading: placeholder });
const BuildOptimizer = dynamic(() => import("./BuildOptimizer").then((module) => module.BuildOptimizer), { loading: placeholder });
const CombatActionBar = dynamic(() => import("./CombatActionBar").then((module) => module.CombatActionBar), { loading: placeholder });
const PriorityEditor = dynamic(() => import("./PriorityEditor").then((module) => module.PriorityEditor), { loading: placeholder });
const RotationTrainer = dynamic(() => import("./RotationTrainer").then((module) => module.RotationTrainer), { loading: placeholder });
const RotationResultGuide = dynamic(() => import("./RotationResultGuide").then((module) => module.RotationResultGuide));
const MetricCards = dynamic(() => import("./MetricCards").then((module) => module.MetricCards));
const CombatStateInspector = dynamic(() => import("./CombatStateInspector").then((module) => module.CombatStateInspector));
const FindingsPanel = dynamic(() => import("./FindingsPanel").then((module) => module.FindingsPanel));

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
  const copy = rotationLabCopy[lang];
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
  /** Jump from a result or a saved combo (far below) to the trainer, keeping the mode switch in view. */
  const showTraining = () => {
    setLabMode("training");
    window.setTimeout(() => document.getElementById("rotation-lab-modes")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };
  const useCombo = (combo: SavedRotationCombo) => {
    setSelectedCombo(combo);
    setRules([...combo.rules]);
    setAplRules(structuredClone(combo.aplRules ?? priorityToAplRules(combo.rules)));
    showTraining();
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
  const Root = embedded ? "section" : "div";
  const specLabel = lang === "ru" ? theme?.specNameRu ?? preset.specialization : theme?.specName ?? preset.specialization;
  const simulateLabel = status === "running" ? tr("Simulating") : tr("Start Simulation");
  return (
    <Root id="rotation-lab-content" data-spec={preset.slug} style={rotationStyle} className={`${styles.lab} ${styles.furyLab} ${shell.lab} ${embedded ? styles.embeddedLab : ""} ${trainingActive ? styles.labTrainingActive : ""} ${connectedEmbed ? `${spread.bookSpread} ${motion.motion}` : ""}`}>
      {embedded ? <section className={`${styles.hero} ${styles.simpleHero} ${connectedEmbed ? `${identityStyles.identityHero} ${spread.leafPair}` : ""}`}>
        <div className={`${styles.specPicker} ${connectedEmbed ? identityStyles.specIdentity : ""}`}>
          <img src={preset.character.iconUrl} alt="" width="72" height="72" />
          <strong className={styles.embeddedCharacter}>{specLabel}</strong>
          <small>{identityMeta}</small>
        </div>
        <div className={styles.titleBlock}>
          <span className={styles.eyebrow}>{theme ? `${lang === "ru" ? theme.classNameRu : theme.className} · ${lang === "ru" ? theme.roleRu : theme.role}`.toUpperCase() : preset.className.toUpperCase()}</span>
          <div className={styles.titleRow}><strong className={styles.embeddedHeroTitle}>{lang === "ru" ? "Ротация и урон" : "Rotation and damage"}</strong></div>
        </div>
      </section> : null}

      <div id="rotation-lab-modes" className={shell.toolbar} data-atlas-ui>
        <div className={shell.modes} role="group" aria-label={copy.modeLabel}>
          <button type="button" aria-pressed={labMode === "simulation"} aria-controls="lab-simulation-panel" onClick={() => setLabMode("simulation")}><BarChart3 aria-hidden="true" />{copy.modeSimulation}</button>
          <button type="button" aria-pressed={labMode === "training"} aria-controls="lab-training-panel" onClick={() => setLabMode("training")}><Dumbbell aria-hidden="true" />{copy.modeTraining}</button>
        </div>
        {!embedded ? <p className={shell.meta}>{copy.meta(preset.patch, preset.character.itemLevel)}</p> : null}
      </div>

      {labMode === "training" ? (
        <section id="lab-training-panel" className={shell.section} aria-label={copy.trainingTitle}>
          <p className={shell.drill} data-atlas-ui><span>{copy.currentDrill}</span><strong>{selectedComboName ?? copy.practiceRotation(specLabel)}</strong><small>{copy.trainingHint}</small></p>
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
        </section>
      ) : <div id="lab-simulation-panel">
        <BuildOptimizer slug={preset.slug} specialization={specLabel} lang={lang} abilities={displayAbilities} scenario={scenario} fightLength={fightLength} targets={targets} rules={rules} aplRules={aplRules} characterSlug={characterSlug} dataMode={dataMode} connectedTalentLoadout={connectedTalentLoadout} embedded={embedded} currentResult={result} resultMatchesCurrent={!isDirty} sectionTitle={copy.buildTitle} sectionText={copy.buildText} onScenarioChange={chooseScenario} onFightLengthChange={setFightLength} onTargetsChange={setTargets} onTalentLoadoutChange={setActiveTalentLoadout} onOptimized={acceptOptimized} onUseCombo={useCombo} />

        <section id="rotation-advanced-analysis" className={`${shell.section} ${connectedEmbed ? motion.chapter : ""}`} aria-labelledby="rotation-panel-title">
          <header className={shell.sectionHeader} data-atlas-ui>
            <div><h2 id="rotation-panel-title">{copy.panelTitle}</h2><p>{copy.panelText}</p></div>
            <div id="rotation-simulation-controls" className={shell.actions}>
              <AtlasButton icon={<RotateCcw aria-hidden="true" />} onClick={() => reset()} disabled={status === "running"}>{tr("Reset")}</AtlasButton>
              <AtlasButton variant="primary" icon={<Play aria-hidden="true" />} onClick={() => void run()} disabled={status === "running"}>{simulateLabel}</AtlasButton>
            </div>
          </header>
          {status === "running" && <div className={shell.progress} role="progressbar" aria-label={tr("Simulation progress")} aria-valuetext={tr("SimulationCraft is calculating your result")}><span /></div>}

          <DeferredMount rootMargin="600px 0px" placeholder={<div className={shell.placeholder} aria-busy="true" />}>
            <CombatActionBar abilities={displayAbilities} rules={rules} result={displayResult} fightLength={fightLength} lang={lang} stale={staleResult} slug={preset.slug} storageScope={characterStorageScope(characterSlug, dataMode)} characterSlug={characterSlug} dataMode={dataMode} manuscript={connectedEmbed} onCursor={setCursor} />
          </DeferredMount>

          <div className={shell.stack} data-atlas-ui>
            {error ? <AtlasNotice tone="caution" title={tr("Simulation unavailable")} action={<AtlasButton size="sm" onClick={() => void run()}>{tr("Try again")}</AtlasButton>}>{simulationErrorMessage(error, tr, lang)}</AtlasNotice> : null}
            {isDirty ? <AtlasNotice title={tr("Changes not simulated")} action={<AtlasButton size="sm" onClick={() => void run()} disabled={status === "running"}>{tr("Simulate changes")}</AtlasButton>}>{tr("The result below belongs to the previous settings.")}</AtlasNotice> : null}
            {!displayResult && status !== "running" && !error ? <AtlasNotice title={copy.resultEmptyTitle}>{copy.resultEmptyText}</AtlasNotice> : null}
            {!displayResult && status === "running" ? <AtlasNotice title={tr("SimulationCraft is calculating your result")} /> : null}
          </div>

          {displayResult ? <BookFoldout enabled={connectedEmbed}><div id="rotation-result" className={staleResult ? styles.resultStale : ""}>{staleResult && <div className={styles.staleBadge}><Info /> {tr("Previous successful result")}</div>}<RotationResultGuide lang={lang} result={displayResult} onFinding={selectFinding} onTraining={showTraining} /><MetricCards result={displayResult} lang={lang} stale={staleResult} lastRunAt={lastRunAt} /><RotationCursorValueContext.Consumer>{(cursor) => <CombatStateInspector result={displayResult} lang={lang} cursor={cursor} onCursor={setCursor} />}</RotationCursorValueContext.Consumer><RotationCursorValueContext.Consumer>{(cursor) => <FindingsPanel findings={displayResult.findings} lang={lang} onSelect={selectFinding} selectedTime={cursor} />}</RotationCursorValueContext.Consumer></div></BookFoldout> : null}

          <BookFoldout enabled={connectedEmbed}>
            {displayResult ? <nav className={styles.analysisTabs} aria-label={tr("Analysis sections")}>{(["timeline", "priority", "opener"] as const).map((view) => <button key={view} type="button" aria-pressed={analysisView === view} onClick={() => setAnalysisView(view)}>{tr(view === "timeline" ? "Timeline" : view === "priority" ? "Priority" : "Opener")}</button>)}</nav> : null}
            <div className={shell.analysis} data-result={Boolean(displayResult)} data-view={analysisView} aria-busy={status === "running"}>
              {(!displayResult || !compactAnalysis || analysisView === "priority") ? <div className={styles.priorityPane}><DeferredMount rootMargin="600px 0px" placeholder={<div className={shell.placeholder} aria-busy="true" />}><PriorityEditor abilities={displayAbilities} rules={rules} aplRules={aplRules} aplOptions={preset.aplOptions ?? { resources: [], buffs: [], cooldowns: preset.defaultRules }} sourceLabel={preset.aplSource?.label ?? preset.engineLabel} defaults={preset.defaultRules} lang={lang} wide={!displayResult} onChange={changePriority} onAplChange={changeApl} onReset={() => reset(true)} interactionsDisabled={status === "running"} /></DeferredMount></div> : null}
              {displayResult && (!compactAnalysis || analysisView === "timeline") ? <div className={styles.timelinePane}><DeferredMount rootMargin="400px 0px" placeholder={<div className={shell.placeholder} aria-busy="true" />}><RotationCursorValueContext.Consumer>{(cursor) => <RotationTimeline result={displayResult} abilities={displayAbilities} lang={lang} cursor={cursor} onCursor={setCursor} />}</RotationCursorValueContext.Consumer></DeferredMount></div> : null}
              {displayResult && (!compactAnalysis || analysisView === "opener") ? <details className={`${styles.openerPreview} ${connectedEmbed ? motion.chapter : ""}`} open={compactAnalysis || undefined}><summary><span>{tr("Opening sequence")}</span><small>{tr("First actions from the simulation")}</small><ChevronDown /></summary><ol>{opener.map((ability, index) => ability ? <li key={`${ability.id}-${index}`}><b>{index + 1}</b><AbilityIcon ability={ability} /><span>{ability.name}</span><i aria-hidden="true">›</i></li> : null)}</ol></details> : null}
            </div>
          </BookFoldout>
          {displayResult ? <p className={`${shell.modelNote} ${connectedEmbed ? spread.leafNotes : ""}`} data-atlas-ui><Info aria-hidden="true" /> {personalReference ? (lang === "ru" ? "SimulationCraft рассчитал DPS, кулдауны, ресурсы и проки по последнему снимку этого персонажа из Battle.net." : "SimulationCraft calculated DPS, cooldowns, resources, and procs from this character's latest Battle.net snapshot.") : liveReference ? (lang === "ru" ? "SimulationCraft рассчитал механику на эталонном профиле специализации. Подключите персонажа для персонального DPS." : "SimulationCraft calculated mechanics on the specialization reference profile. Connect a character for personal DPS.") : (lang === "ru" ? "Точного результата нет: упрощённую оценку не выдаём за SimulationCraft." : "No exact result is available; a simplified estimate is never presented as SimulationCraft.")}</p> : null}
        </section>
      </div>}
    </Root>
  );
}
