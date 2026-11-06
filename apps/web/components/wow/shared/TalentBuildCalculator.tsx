"use client";

import "@/app/styles/talents.css";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AlertTriangle, LoaderCircle, Minus, Plus, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import type { TalentCalculatorData, TalentKind, TalentNode } from "@/lib/talentCalculatorData";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { talentVisualTheme } from "@/lib/talentVisualTheme";
import { decodeWoWTalentLoadout, encodeWoWTalentLoadout, FURY_REFERENCE_LOADOUT, talentPointBudgets } from "@/lib/wowTalentLoadout";
import { type TalentScenarioId } from "@/lib/wow/testCharacterTalentAudit";
import { talentSimulationIntegrityError } from "@/lib/wow/talentSimulationIntegrity";
import { TalentDescription } from "@/components/talents/TalentDescription";
import { talentSimulationMessage } from "@/components/talents/talentSimulationMessages";
import { TalentTreePanel } from "@/components/talents/TalentTreePanel";
import { CharacterBuildManager } from "@/components/wow/audit/CharacterBuildManager";
import { CharacterTalentOptimizer } from "@/components/wow/audit/CharacterTalentOptimizer";
import { talentText, localizedTalentScenarios, type TalentLang } from "@/components/talents/talentLocale";
import styles from "@/components/wow/audit/characterTalentSimulator.module.css";
import tools from "@/components/wow/audit/characterTools.module.css";
import { withCharacterContext } from "@/lib/platform/rotation/characterRequestContext";
import { recordCharacterRun } from "@/lib/wow/characterRunHistory";

type CombatStats = { primary: number; crit: number; haste: number; mastery: number; versatility: number };
type Selection = { ranks: Map<string, number>; choices: Map<string, number>; origin?: "battle-net" | "reference" | "empty" };
type TalentChange = { id: string; name: string; iconUrl: string; ranks: number; kind: "added" | "removed" | "automatic" | "choice" };
type SimulationState = {
  status: "loading" | "ready" | "error";
  /** The request this answer belongs to; any other request shows as loading. */
  key?: string;
  singleTargetDelta?: number;
  aoeDelta?: number;
  baselineSingleTargetDps?: number;
  candidateSingleTargetDps?: number;
  baselineAoeDps?: number;
  candidateAoeDps?: number;
  statDeltas?: CombatStats;
  engine?: string;
  iterations?: number;
  encounter?: { duration: number; aoeTargets: number };
  uncertainty?: { confidence: number; singleTargetDps: number; singleTargetPercent: number; aoeDps: number; aoePercent: number };
  error?: string;
};

const defaultStats: CombatStats = { primary: 0, crit: 0, haste: 0, mastery: 0, versatility: 0 };

function initialSelection(data: TalentCalculatorData, loadout: string | undefined, allowReference: boolean): Selection | null {
  const battleNet = decodeWoWTalentLoadout(data, loadout ?? "");
  if (battleNet) return { ranks: new Map(battleNet.ranks), choices: new Map(battleNet.choices), origin: "battle-net" };
  if (!allowReference) return null;
  const reference = data.specId === 72 ? decodeWoWTalentLoadout(data, FURY_REFERENCE_LOADOUT) : null;
  if (reference) return { ranks: new Map(reference.ranks), choices: new Map(reference.choices), origin: "reference" };
  return {
    ranks: new Map(Object.values(data.trees).flatMap((tree) => tree.nodes.filter((node) => node.freeNode).map((node) => [node.id, node.maxRanks] as const))),
    choices: new Map(),
    origin: "empty",
  };
}

function spent(ranks: Map<string, number>, data: TalentCalculatorData, kind: TalentKind) {
  const free = new Set(data.trees[kind].nodes.filter((node) => node.freeNode).map((node) => node.id));
  return [...ranks.entries()].filter(([id]) => id.startsWith(`${kind}-`) && !free.has(id)).reduce((sum, [, rank]) => sum + rank, 0);
}

function available(node: TalentNode, kind: TalentKind, ranks: Map<string, number>, data: TalentCalculatorData, lang: TalentLang = "ru") {
  if (node.freeNode) return { ok: true, reason: "" };
  const tree = data.trees[kind];
  const byNodeId = new Map(tree.nodes.map((entry) => [entry.nodeId, entry]));
  const spentBeforeNode = Math.max(0, spent(ranks, data, kind) - (ranks.get(node.id) ?? 0));
  if (node.requiredPoints && spentBeforeNode < node.requiredPoints) return { ok: false, reason: lang === "ru" ? `Нужно потратить ещё ${node.requiredPoints - spentBeforeNode} очк. в этом дереве` : `Spend ${node.requiredPoints - spentBeforeNode} more points in this tree` };
  const requirements = node.requiresNodeIds.length ? node.requiresNodeIds : node.prevNodeIds;
  if (requirements.length && !requirements.some((id) => {
    const parent = byNodeId.get(id);
    return parent && (ranks.get(parent.id) ?? 0) > 0;
  })) return { ok: false, reason: talentText(lang, "Сначала выберите один из связанных талантов слева") };
  return { ok: true, reason: "" };
}

function prune(data: TalentCalculatorData, ranks: Map<string, number>) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const kind of Object.keys(data.trees) as TalentKind[]) {
      for (const node of data.trees[kind].nodes) {
        if ((ranks.get(node.id) ?? 0) > 0 && !node.freeNode && !available(node, kind, ranks, data).ok) {
          ranks.delete(node.id);
          changed = true;
        }
      }
    }
  }
}

function delta(value: number, percent = true) {
  if (Math.abs(value) < .005) return "0";
  return `${value > 0 ? "+" : ""}${percent ? value.toFixed(2) : Math.round(value)}${percent ? "%" : ""}`;
}

function sameMap(left: Map<string, number>, right: Map<string, number>) {
  return left.size === right.size && [...left].every(([key, value]) => right.get(key) === value);
}

function editSummary(baseline: Selection, selection: Selection) {
  const rankIds = new Set([...baseline.ranks.keys(), ...selection.ranks.keys()]);
  const choiceIds = new Set([...baseline.choices.keys(), ...selection.choices.keys()]);
  let addedRanks = 0;
  let removedRanks = 0;
  for (const id of rankIds) {
    const change = (selection.ranks.get(id) ?? 0) - (baseline.ranks.get(id) ?? 0);
    if (change > 0) addedRanks += change;
    if (change < 0) removedRanks -= change;
  }
  const choiceChanges = [...choiceIds].filter((id) => baseline.choices.get(id) !== selection.choices.get(id)).length;
  return { addedRanks, removedRanks, editDistance: addedRanks + removedRanks + choiceChanges };
}

function talentChangeSet(data: TalentCalculatorData, baseline: Selection, selection: Selection, automaticRanks: Map<string, number>, lang: TalentLang): TalentChange[] {
  const nodes = Object.values(data.trees).flatMap((tree) => tree.nodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const changes: TalentChange[] = [];
  for (const id of new Set([...baseline.ranks.keys(), ...selection.ranks.keys()])) {
    const node = byId.get(id);
    if (!node) continue;
    const before = baseline.ranks.get(id) ?? 0;
    const after = selection.ranks.get(id) ?? 0;
    const difference = after - before;
    if (!difference) continue;
    const choiceId = difference > 0 ? selection.choices.get(id) : baseline.choices.get(id);
    const choice = node.choices.find((entry) => entry.externalId === choiceId) ?? node.choices[0];
    const automatic = difference < 0 ? Math.min(-difference, automaticRanks.get(id) ?? 0) : 0;
    if (difference < 0 && automatic) changes.push({ id: `${id}-automatic`, name: choice?.name ?? talentText(lang, "Неизвестный талант"), iconUrl: choice?.iconUrl ?? "", ranks: automatic, kind: "automatic" });
    const manualRanks = difference < 0 ? -difference - automatic : difference;
    if (manualRanks > 0) changes.push({ id, name: choice?.name ?? talentText(lang, "Неизвестный талант"), iconUrl: choice?.iconUrl ?? "", ranks: manualRanks, kind: difference > 0 ? "added" : "removed" });
  }
  for (const id of new Set([...baseline.choices.keys(), ...selection.choices.keys()])) {
    if ((baseline.ranks.get(id) ?? 0) <= 0 || (selection.ranks.get(id) ?? 0) <= 0 || baseline.choices.get(id) === selection.choices.get(id)) continue;
    const node = byId.get(id);
    const after = node?.choices.find((entry) => entry.externalId === selection.choices.get(id));
    if (after) changes.push({ id: `${id}-choice`, name: after.name, iconUrl: after.iconUrl ?? "", ranks: 1, kind: "choice" });
  }
  return changes;
}

function playNodeBurst(target: HTMLButtonElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  target.animate([
    { transform: "translate(-50%,-50%) scale(1)" },
    { transform: "translate(-50%,-50%) scale(.82)", offset: .2 },
    { transform: "translate(-50%,-50%) scale(1.24)", offset: .55 },
    { transform: "translate(-50%,-50%) scale(1)" },
  ], { duration: 320, easing: "cubic-bezier(.16,.86,.22,1)" });
}

type SimulatorProps = { data: TalentCalculatorData | null; specSlug: string; loadout?: string; onCandidateLoadoutChange?: (loadout: string) => void; localePrefix?: "" | "/ru" } & (
  { mode?: "character"; characterSlug: string; baseStats?: CombatStats; scenario: TalentScenarioId; onScenarioChange: (scenario: TalentScenarioId) => void; dataMode: "fixture" | "battle-net"; snapshotKey?: string; readOnly?: never } |
  { mode: "shared"; readOnly: boolean; characterSlug?: never; baseStats?: never; scenario?: never; onScenarioChange?: never; dataMode?: never; snapshotKey?: never }
);
const keepScenario = () => {};

export function TalentBuildCalculator({ data, characterSlug = "", specSlug, loadout, baseStats = defaultStats, scenario = "mythic-plus", onScenarioChange = keepScenario, onCandidateLoadoutChange, dataMode = "battle-net", localePrefix = "/ru", snapshotKey = "initial", mode = "character", readOnly = false }: SimulatorProps) {
  const shared = mode === "shared";
  const lang: TalentLang = localePrefix === "/ru" ? "ru" : "en";
  const talentScenarios = useMemo(() => localizedTalentScenarios(lang), [lang]);
  const labels: Record<TalentKind, string> = { class: talentText(lang, "Класс"), hero: talentText(lang, "Герой"), spec: talentText(lang, "Специализация") };
  const baseline = useMemo(() => data ? initialSelection(data, loadout, dataMode === "fixture") : null, [data, dataMode, loadout]);
  const [selection, setSelection] = useState<Selection | null>(baseline);
  const [simulationResult, setSimulation] = useState<SimulationState>({ status: "loading" });
  const [activeTree, setActiveTree] = useState<TalentKind>("spec");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [automaticRanks, setAutomaticRanks] = useState<Map<string, number>>(new Map());
  // A new profile or tree resets the edit during render instead of in an effect (no cascading renders).
  const [selectionBase, setSelectionBase] = useState(baseline);
  if (selectionBase !== baseline) { setSelectionBase(baseline); setSelection(baseline); setAutomaticRanks(new Map()); }
  const simulationCodes = useMemo(() => {
    if (!data || !baseline || !selection) return null;
    const unchanged = sameMap(baseline.ranks, selection.ranks) && sameMap(baseline.choices, selection.choices);
    const edits = editSummary(baseline, selection);
    return {
      baseline: loadout || encodeWoWTalentLoadout(data, baseline.ranks, baseline.choices),
      candidate: unchanged && loadout ? loadout : encodeWoWTalentLoadout(data, selection.ranks, selection.choices),
      ...edits,
    };
  }, [baseline, data, loadout, selection]);
  const changes = useMemo(() => data && baseline && selection ? talentChangeSet(data, baseline, selection, automaticRanks, lang) : [], [automaticRanks, baseline, data, selection, lang]);

  useEffect(() => {
    if (!readOnly && simulationCodes?.candidate) onCandidateLoadoutChange?.(simulationCodes.candidate);
  }, [onCandidateLoadoutChange, readOnly, simulationCodes?.candidate]);

  const simulationKey = simulationCodes ? `${simulationCodes.candidate}|${scenario}|${retryKey}` : "";
  const simulation: SimulationState = simulationResult.key === simulationKey ? simulationResult : { status: "loading" };
  useEffect(() => {
    if (shared || !data || !simulationCodes || !simulationCodes.editDistance) return;
    const controller = new AbortController();
    const key = `${simulationCodes.candidate}|${scenario}|${retryKey}`;
    const timer = window.setTimeout(() => {
      fetch("/api/wow/talent-simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withCharacterContext({ spec: specSlug, scenario, candidateLoadout: simulationCodes.candidate, baselineLoadout: simulationCodes.baseline, editDistance: simulationCodes.editDistance, addedRanks: simulationCodes.addedRanks, removedRanks: simulationCodes.removedRanks }, characterSlug, dataMode)),
        signal: controller.signal,
      }).then(async (response) => {
        const payload = await response.json() as Omit<SimulationState, "status">;
        if (!response.ok) throw new Error(payload.error || talentText(lang, "Расчёт недоступен"));
        const integrityError = talentSimulationIntegrityError({
          editDistance: simulationCodes.editDistance,
          addedRanks: simulationCodes.addedRanks,
          removedRanks: simulationCodes.removedRanks,
          singleTargetDelta: payload.singleTargetDelta ?? 0,
          aoeDelta: payload.aoeDelta ?? 0,
        });
        if (integrityError) throw new Error(integrityError);
        const ready = { status: "ready" as const, key, ...payload, singleTargetDelta: payload.singleTargetDelta ?? 0, aoeDelta: payload.aoeDelta ?? 0 };
        setSimulation(ready);
        if (dataMode === "battle-net") void recordCharacterRun(characterSlug, specSlug, {
          kind: "talent",
          gameBuild: data.buildVersion || "unknown",
          profileFingerprint: snapshotKey,
          scenario: { id: scenario, durationSeconds: payload.encounter?.duration ?? 60, targets: payload.encounter?.aoeTargets ?? 1 },
          engine: payload.engine || "SimulationCraft",
          metrics: {
            baselineDps: payload.baselineSingleTargetDps,
            candidateDps: payload.candidateSingleTargetDps,
            deltaPercent: payload.singleTargetDelta ?? 0,
            aoeDps: payload.candidateAoeDps,
            aoeDeltaPercent: payload.aoeDelta ?? 0,
            confidence: payload.uncertainty?.confidence,
            iterations: payload.iterations,
          },
          label: `${talentText(lang, "Таланты")} · ${talentScenarios.find((entry) => entry.id === scenario)?.label ?? scenario}`,
        }).catch(() => undefined);
      }).catch((error: Error) => { if (error.name !== "AbortError") setSimulation({ status: "error", key, error: talentSimulationMessage(error.message, lang) }); });
    }, 650);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [characterSlug, data, dataMode, retryKey, scenario, simulationCodes, snapshotKey, specSlug, lang, talentScenarios, shared]);

  if (!data || !baseline || !selection) return <section className={styles.shell}><p className={styles.empty} role="status"><AlertTriangle aria-hidden="true" /><b>{talentText(lang, "Battle.net не отдал активный билд")}</b><span>{talentText(lang, "Переключите специализацию в игре и обновите профиль.")}</span></p></section>;

  const budgets = talentPointBudgets(data);
  const tree = data.trees[activeTree];
  const theme = getTalentSpecTheme(specSlug);
  const treeEdges = tree.nodes.flatMap((node) => node.nextNodeIds.flatMap((nextId) => {
    const target = tree.nodes.find((entry) => entry.nodeId === nextId);
    return target ? [[node, target] as const] : [];
  }));
  const scenarioLabel = talentScenarios.find((entry) => entry.id === scenario)?.label ?? scenario;
  const focused = Object.values(data.trees).flatMap((entry) => entry.nodes).find((node) => node.id === focusedId) ?? tree.nodes.find((node) => (selection.ranks.get(node.id) ?? 0) > 0) ?? tree.nodes[0];
  const focusedChoice = focused?.choices.find((choice) => choice.externalId === selection.choices.get(focused.id)) ?? focused?.choices[0];
  const focusedRank = focused ? selection.ranks.get(focused.id) ?? 0 : 0;
  const focusedLock = focused && !focusedRank ? available(focused, activeTree, selection.ranks, data, lang) : null;
  const edited = (simulationCodes?.editDistance ?? 0) > 0;

  const setRank = (node: TalentNode, requestedRank: number) => {
    if (readOnly || node.freeNode) return;
    const state = available(node, activeTree, selection.ranks, data, lang);
    const current = selection.ranks.get(node.id) ?? 0;
    const nextRank = Math.max(0, Math.min(node.maxRanks, requestedRank));
    if (nextRank > current && !state.ok) { setNotice(state.reason); return; }
    if (nextRank > current && spent(selection.ranks, data, activeTree) + (nextRank - current) > budgets[activeTree]) { setNotice(talentText(lang, "Свободных очков не хватает. Сначала уберите очко из другого таланта.")); return; }
    const ranks = new Map(selection.ranks);
    const choices = new Map(selection.choices);
    if (nextRank) ranks.set(node.id, nextRank); else { ranks.delete(node.id); choices.delete(node.id); }
    if (nextRank && node.nodeType === "choice" && !choices.has(node.id) && node.choices[0]) choices.set(node.id, node.choices[0].externalId);
    const beforePrune = new Map(ranks);
    if (!nextRank) prune(data, ranks);
    setAutomaticRanks((current) => {
      const next = new Map(current);
      next.delete(node.id);
      for (const [id, rankBeforePrune] of beforePrune) {
        const removedAutomatically = rankBeforePrune - (ranks.get(id) ?? 0);
        if (id !== node.id && removedAutomatically > 0) next.set(id, (next.get(id) ?? 0) + removedAutomatically);
      }
      for (const [id] of next) if ((ranks.get(id) ?? 0) >= (baseline.ranks.get(id) ?? 0)) next.delete(id);
      return next;
    });
    for (const id of [...choices.keys()]) if (!ranks.has(id)) choices.delete(id);
    const pointsBefore = [...selection.ranks.values()].reduce((sum, value) => sum + value, 0);
    const pointsAfter = [...ranks.values()].reduce((sum, value) => sum + value, 0);
    const dependents = Math.max(0, pointsBefore - pointsAfter) - (current - nextRank);
    setSelection({ ranks, choices });
    setFocusedId(node.id);
    setNotice(dependents > 0 ? `${talentText(lang, "Дерево сняло зависимые ранги: ")}${dependents}` : "");
  };

  const changeRank = (node: TalentNode) => {
    const current = selection.ranks.get(node.id) ?? 0;
    setRank(node, current >= node.maxRanks ? 0 : current + 1);
  };

  const cycleChoice = () => {
    if (readOnly || !focused || focused.choices.length < 2 || !(selection.ranks.get(focused.id) ?? 0)) return;
    const index = Math.max(0, focused.choices.findIndex((choice) => choice.externalId === selection.choices.get(focused.id)));
    const choices = new Map(selection.choices);
    choices.set(focused.id, focused.choices[(index + 1) % focused.choices.length].externalId);
    setSelection({ ranks: new Map(selection.ranks), choices });
  };

  const restoreBaseline = () => {
    setSelection({ ranks: new Map(baseline.ranks), choices: new Map(baseline.choices), origin: baseline.origin });
    setAutomaticRanks(new Map());
    setNotice("");
  };

  const loadSavedBuild = (savedLoadout: string) => {
    const decoded = decodeWoWTalentLoadout(data, savedLoadout);
    if (!decoded) return false;
    setSelection({ ranks: new Map(decoded.ranks), choices: new Map(decoded.choices) });
    setFocusedId(null);
    setNotice("");
    setAutomaticRanks(new Map());
    return true;
  };

  return <section className={styles.shell} aria-label={shared ? undefined : talentText(lang, "Таланты")} data-talent-editor={shared ? "shared" : "character"} data-read-only={readOnly || undefined}>
    {!shared && <div className={styles.toolbar}>
      <label className={`${tools.field} ${styles.scenario}`} htmlFor="character-talents-scenario">{talentText(lang, "Бой")}<select id="character-talents-scenario" value={scenario} onChange={(event) => { const chosen = talentScenarios.find((entry) => entry.id === event.currentTarget.value && entry.group === "PvE"); if (chosen) onScenarioChange(chosen.id); }}>
        {!talentScenarios.some((entry) => entry.id === scenario && entry.group === "PvE") ? <option value={scenario}>{scenarioLabel}</option> : null}
        {talentScenarios.filter((entry) => entry.group === "PvE").map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      </select></label>
      {edited ? <button type="button" className={tools.quiet} onClick={restoreBaseline}><RotateCcw aria-hidden="true" />{talentText(lang, "Вернуть исходный билд")}</button> : null}
    </div>}
    {!shared && <div className={styles.results} aria-live="polite" hidden={!edited}>
      {!edited ? null
        : simulation.status === "loading" ? <p className={tools.status}><LoaderCircle className={tools.spin} aria-hidden="true" />{talentText(lang, "Считаем урон…")}</p>
        : simulation.status === "error" ? <div className={styles.simError}><p className={tools.alert}><AlertTriangle aria-hidden="true" />{simulation.error}</p><button type="button" className={tools.quiet} onClick={() => setRetryKey((value) => value + 1)}><RefreshCw aria-hidden="true" />{talentText(lang, "Повторить расчёт")}</button></div>
        : <>
          <ResultVerdict lang={lang} singleTarget={simulation.singleTargetDelta ?? 0} aoe={simulation.aoeDelta ?? 0} singleTargetMargin={simulation.uncertainty?.singleTargetPercent ?? 0} aoeMargin={simulation.uncertainty?.aoePercent ?? 0} scenario={scenario} />
          <div className={styles.damage}>
            <Metric lang={lang} name={talentText(lang, "Одна цель")} before={simulation.baselineSingleTargetDps} after={simulation.candidateSingleTargetDps} change={simulation.singleTargetDelta ?? 0} marginPercent={simulation.uncertainty?.singleTargetPercent} />
            <Metric lang={lang} name={`${talentText(lang, "Пачка")}${simulation.encounter?.aoeTargets ? ` · ${simulation.encounter.aoeTargets}` : ""}`} before={simulation.baselineAoeDps} after={simulation.candidateAoeDps} change={simulation.aoeDelta ?? 0} marginPercent={simulation.uncertainty?.aoePercent} />
          </div>
          <StatChanges lang={lang} base={baseStats} deltas={simulation.statDeltas} />
        </>}
      {changes.length ? <TalentChangeSet lang={lang} changes={changes} /> : null}
    </div>}
    <div className={styles.workspace}>
      <div className={styles.builder}>
        <nav className={styles.trees} aria-label={talentText(lang, "Деревья талантов")}>{(Object.keys(labels) as TalentKind[]).map((kind) => <button key={kind} type="button" aria-pressed={activeTree === kind} onClick={() => { setActiveTree(kind); setFocusedId(null); }}><span>{labels[kind]}</span><b>{spent(selection.ranks, data, kind)}/{budgets[kind]}</b></button>)}</nav>
        <div className={styles.treeViewport} role="region" tabIndex={0} aria-label={`${talentText(lang, "Дерево талантов")}: ${labels[activeTree]}`} onFocusCapture={(event) => {
          if (event.currentTarget.scrollWidth > event.currentTarget.clientWidth && event.target instanceof HTMLElement && event.target.matches(".tc-node")) {
            event.target.scrollIntoView({ block: "nearest", inline: "nearest" });
          }
        }}>
        <div className={`talent-calculator ${styles.embeddedCalculator}`} data-performance="balanced">
          <TalentTreePanel lang={lang} appearance="atlas" specSlug={activeTree === "spec" ? theme?.slug : undefined} variant={activeTree} eyebrow={labels[activeTree]} title={activeTree === "hero" ? data.heroName : activeTree === "class" ? data.className : data.specName} iconSrc={activeTree === "hero" ? data.heroIconUrl : activeTree === "spec" ? theme?.iconUrl : theme?.classIconUrl} spent={spent(selection.ranks, data, activeTree)} budget={budgets[activeTree]} nodeCount={tree.nodes.length}>
            <div className="tc-tree-canvas">
              <svg className="tc-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <marker id={`talent-arrow-${activeTree}`} markerWidth="4" markerHeight="4" refX="3.4" refY="2" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L4,2 L0,4 Z" /></marker>
                  <marker id={`talent-arrow-active-${activeTree}`} markerWidth="4" markerHeight="4" refX="3.4" refY="2" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L4,2 L0,4 Z" /></marker>
                </defs>
                {treeEdges.map(([from, to]) => {
                  const fromSelected = (selection.ranks.get(from.id) ?? 0) > 0;
                  const toSelected = (selection.ranks.get(to.id) ?? 0) > 0;
                  const touchesFocused = focused?.id === to.id || focused?.id === from.id;
                  const classes = [fromSelected && toSelected ? "is-lit" : "", fromSelected && !toSelected ? styles.availablePath : "", touchesFocused ? styles.focusedPath : ""].filter(Boolean).join(" ");
                  return <line key={`${from.id}-${to.id}`} className={classes || undefined} x1={from.y} y1={100 - from.x} x2={to.y} y2={100 - to.x} markerEnd={`url(#talent-arrow-${fromSelected && toSelected ? `active-${activeTree}` : activeTree})`} />;
                })}
              </svg>
              {tree.nodes.map((node) => {
                const rank = selection.ranks.get(node.id) ?? 0;
                const state = available(node, activeTree, selection.ranks, data, lang);
                const selectedChoice = selection.choices.get(node.id);
                const choiceIndex = Math.max(0, node.choices.findIndex((entry) => entry.externalId === selectedChoice));
                const choice = node.choices[choiceIndex] ?? node.choices[0];
                const visual = talentVisualTheme(node, selectedChoice);
                return <button key={node.id} type="button" data-node-id={node.id} data-rank={rank} data-choice={choiceIndex} className={`tc-node ${node.talentType} ${node.nodeType} tc-vfx-${visual.theme}${rank ? " is-selected" : ""}${!state.ok && !rank ? " is-locked" : ""}`} style={{ left: `${node.y}%`, top: `${100 - node.x}%`, "--tc-vfx-phase": `${visual.phaseMs}ms`, "--tc-vfx-speed": `${visual.durationMs}ms`, "--tc-vfx-angle": `${visual.angleDeg}deg`, "--tc-sigil-rotation": `${visual.sigilRotation}deg`, "--tc-sigil-dash": visual.sigilDash } as CSSProperties} aria-pressed={rank > 0} aria-disabled={!state.ok && !rank} aria-label={`${choice?.name ?? talentText(lang, "Талант")}, ${rank}/${node.maxRanks}${state.reason ? `, ${state.reason}` : ""}`} onClick={(event) => { setFocusedId(node.id); if (!readOnly) { playNodeBurst(event.currentTarget); changeRank(node); } }} onContextMenu={(event) => { event.preventDefault(); if (!readOnly && rank) { playNodeBurst(event.currentTarget); setRank(node, rank - 1); } }} onFocus={() => setFocusedId(node.id)} onMouseEnter={() => setFocusedId(node.id)}>
                  <span className="tc-node-vfx" aria-hidden="true" />
                  <svg className={`tc-node-sigil tc-sigil-${visual.asset}`} data-vfx-asset={visual.assetId} viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path className="tc-sigil-orbit" d={visual.sigilPath} /><path className="tc-sigil-mark" d={visual.assetMark} /></svg>
                  <span className="tc-node-ring" />
                  <span className={`tc-node-art${node.nodeType === "choice" ? " is-choice" : ""}`} data-selected-choice={choiceIndex} aria-hidden="true">{choice?.iconUrl ? <img className="tc-choice-art-selected" src={choice.iconUrl} alt="" loading="lazy" decoding="async" /> : <Sparkles />}{node.nodeType === "choice" && node.choices.length > 1 ? <span className="tc-choice-switch"><i /><i /><b>↔</b></span> : null}</span>
                  <span className="tc-node-count">{rank}/{node.maxRanks}</span>
                  <span className={styles.nodeName} aria-hidden="true">{choice?.name}</span>
                </button>;
              })}
            </div>
          </TalentTreePanel>
        </div>
        </div>
        {notice ? <p className={tools.status} role="status"><AlertTriangle aria-hidden="true" />{notice}</p> : null}
        {focused && focusedChoice ? <article className={styles.details} data-testid="shared-talent-inspection">
          <img src={focusedChoice.iconUrl || "/assets/wow/icon-unverified.svg"} alt="" width={48} height={48} />
          <div><b>{focusedChoice.name}</b><TalentDescription talent={focusedChoice} locale={lang} />{focusedLock && !focusedLock.ok ? <p className={styles.lockReason}>{focusedLock.reason}</p> : null}</div>
          {!readOnly && !focused.freeNode ? <div className={styles.detailActions}>
            <button type="button" className={tools.quiet} disabled={!focusedRank} onClick={() => setRank(focused, focusedRank - 1)} aria-label={talentText(lang, "−1 ранг")}><Minus aria-hidden="true" /></button>
            <span>{focusedRank}/{focused.maxRanks}</span>
            <button type="button" className={tools.quiet} disabled={focusedRank >= focused.maxRanks} onClick={() => setRank(focused, focusedRank + 1)} aria-label={talentText(lang, "+1 ранг")}><Plus aria-hidden="true" /></button>
            {focused.choices.length > 1 ? <button type="button" className={tools.quiet} disabled={!focusedRank} onClick={cycleChoice}>{talentText(lang, "Сменить вариант")}</button> : null}
          </div> : null}
        </article> : null}
      </div>
    </div>
    {!shared && <div className={styles.extras}>
      <CharacterTalentOptimizer lang={lang} data={data} characterSlug={characterSlug} specSlug={specSlug} scenario={scenario} dataMode={dataMode} resetKey={snapshotKey} onApply={loadSavedBuild} />
      <CharacterBuildManager lang={lang} characterSlug={characterSlug} specSlug={specSlug} dataMode={dataMode} buildVersion={data.buildVersion} currentLoadout={simulationCodes?.candidate ?? ""} scenario={scenario} onScenarioChange={onScenarioChange} onLoad={loadSavedBuild} />
    </div>}
  </section>;
}

function TalentChangeSet({ lang, changes }: { lang: TalentLang; changes: TalentChange[] }) {
  const groups: Array<{ kind: TalentChange["kind"]; title: string }> = [
    { kind: "added", title: talentText(lang, "Добавлены") },
    { kind: "removed", title: talentText(lang, "Сняты") },
    { kind: "automatic", title: talentText(lang, "Отключены деревом") },
    { kind: "choice", title: talentText(lang, "Изменён вариант") },
  ];
  return <section className={styles.changeSet} aria-label={talentText(lang, "Изменения")}>
    {groups.map((group) => {
      const entries = changes.filter((change) => change.kind === group.kind);
      return entries.length ? <div key={group.kind} data-kind={group.kind}><h4>{group.title}</h4><ul>{entries.map((change) => <li key={change.id}><img src={change.iconUrl || "/assets/wow/icon-unverified.svg"} alt="" width={24} height={24} /><span>{change.name}</span><em>{change.kind === "added" ? "+" : change.kind === "choice" ? "↔" : "−"}{change.kind === "choice" ? "" : change.ranks}</em></li>)}</ul></div> : null;
    })}
  </section>;
}

function ResultVerdict({ lang, singleTarget, aoe, singleTargetMargin, aoeMargin, scenario }: { lang: TalentLang; singleTarget: number; aoe: number; singleTargetMargin: number; aoeMargin: number; scenario: TalentScenarioId }) {
  const group = scenario === "pve-aoe" || scenario === "mythic-plus";
  const primary = group ? aoe : singleTarget;
  const primaryMargin = group ? aoeMargin : singleTargetMargin;
  const direction = (value: number, margin: number) => value > margin ? 1 : value < -margin ? -1 : 0;
  const singleDirection = direction(singleTarget, singleTargetMargin);
  const aoeDirection = direction(aoe, aoeMargin);
  const [tone, text] = singleDirection > 0 && aoeDirection < 0 ? ["mixed", talentText(lang, "Сильнее в одну цель, слабее по пачке")]
    : aoeDirection > 0 && singleDirection < 0 ? ["mixed", talentText(lang, "Сильнее по пачке, слабее в босса")]
    : Math.abs(primary) <= primaryMargin ? ["even", talentText(lang, "Разница меньше погрешности")]
    : primary > primaryMargin ? ["good", talentText(lang, "Для выбранного режима стало лучше")]
    : ["bad", talentText(lang, "Для выбранного режима стало хуже")];
  return <p className={styles.verdict} data-tone={tone}>{text}</p>;
}

function Metric({ lang, name, before, after, change, marginPercent = 0 }: { lang: TalentLang; name: string; before?: number; after?: number; change: number; marginPercent?: number }) {
  const conclusive = Math.abs(change) > marginPercent;
  const tone = conclusive && change > .005 ? "good" : conclusive && change < -.005 ? "bad" : "even";
  return <div data-tone={tone}><span>{name}</span><b>{delta(change)}</b><small>{formatDps(before, lang)} → {formatDps(after, lang)} DPS</small></div>;
}

const numberLocale: Record<TalentLang, string> = { ru: "ru-RU", en: "en-US" };

function formatDps(value: number | undefined, lang: TalentLang) {
  return Number.isFinite(value) ? `${Math.round(value!).toLocaleString(numberLocale[lang])}` : "—";
}

function StatChanges({ lang, base, deltas }: { lang: TalentLang; base: CombatStats; deltas?: CombatStats }) {
  if (!deltas) return null;
  const rows = ([["crit", "Критический удар"], ["haste", "Скорость"], ["mastery", "Искусность"], ["versatility", "Универсальность"]] as const)
    .filter(([key]) => Math.abs(deltas[key]) >= .005);
  if (!rows.length) return null;
  return <dl className={styles.stats}>{rows.map(([key, name]) => <div key={key}><dt>{talentText(lang, name)}</dt><dd>{base[key].toFixed(2)}% <em>{deltas[key] > 0 ? "+" : ""}{deltas[key].toFixed(2)}</em></dd></div>)}</dl>;
}
