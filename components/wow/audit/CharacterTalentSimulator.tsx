"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AlertTriangle, Check, LoaderCircle, LockKeyhole, Minus, Plus, RotateCcw, Sparkles, Swords } from "lucide-react";
import type { TalentCalculatorData, TalentKind, TalentNode } from "@/lib/talentCalculatorData";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { talentVisualTheme } from "@/lib/talentVisualTheme";
import { decodeWoWTalentLoadout, encodeWoWTalentLoadout, FURY_REFERENCE_LOADOUT, talentPointBudgets } from "@/lib/wowTalentLoadout";
import { type TalentScenarioId } from "@/lib/wow/testCharacterTalentAudit";
import { talentSimulationIntegrityError } from "@/lib/wow/talentSimulationIntegrity";
import { TalentDescription } from "@/components/talents/TalentDescription";
import { talentSimulationMessage } from "@/components/talents/talentSimulationMessages";
import { TalentTreePanel } from "@/components/talents/TalentTreePanel";
import { SpecSignatureFx } from "@/components/talents/spec-signature/SpecSignatureFx";
import { CharacterBuildManager } from "./CharacterBuildManager";
import { CharacterTalentOptimizer } from "./CharacterTalentOptimizer";
import { WarcraftFrame } from "./WarcraftFrame";
import { talentText, localizedTalentScenarios, type TalentLang } from "@/components/talents/talentLocale";
import styles from "./characterTalentSimulator.module.css";
import { withCharacterContext } from "@/lib/platform/rotation/characterRequestContext";
import { recordCharacterRun } from "@/lib/wow/characterRunHistory";

type CombatStats = { primary: number; crit: number; haste: number; mastery: number; versatility: number };
type Selection = { ranks: Map<string, number>; choices: Map<string, number>; origin?: "battle-net" | "reference" | "empty" };
type TalentChange = { id: string; name: string; iconUrl: string; ranks: number; kind: "added" | "removed" | "automatic" | "choice"; detail: string };
type SimulationState = {
  status: "loading" | "ready" | "error";
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
    if (difference < 0 && automatic) changes.push({ id: `${id}-automatic`, name: choice?.name ?? talentText(lang, "Неизвестный талант"), iconUrl: choice?.iconUrl ?? "", ranks: automatic, kind: "automatic", detail: talentText(lang, "Отключён деревом: после предыдущего изменения требования больше не выполнены.") });
    const manualRanks = difference < 0 ? -difference - automatic : difference;
    if (manualRanks > 0) changes.push({ id, name: choice?.name ?? talentText(lang, "Неизвестный талант"), iconUrl: choice?.iconUrl ?? "", ranks: manualRanks, kind: difference > 0 ? "added" : "removed", detail: difference > 0 ? talentText(lang, "Ранг добавлен пользователем.") : talentText(lang, "Ранг снят пользователем.") });
  }
  for (const id of new Set([...baseline.choices.keys(), ...selection.choices.keys()])) {
    if ((baseline.ranks.get(id) ?? 0) <= 0 || (selection.ranks.get(id) ?? 0) <= 0 || baseline.choices.get(id) === selection.choices.get(id)) continue;
    const node = byId.get(id);
    const before = node?.choices.find((entry) => entry.externalId === baseline.choices.get(id));
    const after = node?.choices.find((entry) => entry.externalId === selection.choices.get(id));
    if (after) changes.push({ id: `${id}-choice`, name: after.name, iconUrl: after.iconUrl ?? "", ranks: 1, kind: "choice", detail: lang === "ru" ? `Вариант изменён: ${before?.name ?? "предыдущий"} → ${after.name}.` : `Choice changed: ${before?.name ?? "previous"} → ${after.name}.` });
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

export function CharacterTalentSimulator({ data, characterSlug, specSlug, loadout, baseStats = defaultStats, scenario, onScenarioChange, onCandidateLoadoutChange, dataMode, localePrefix = "/ru", snapshotKey = "initial" }: { data: TalentCalculatorData | null; characterSlug: string; specSlug: string; loadout?: string; baseStats?: CombatStats; scenario: TalentScenarioId; onScenarioChange: (scenario: TalentScenarioId) => void; onCandidateLoadoutChange?: (loadout: string) => void; dataMode: "fixture" | "battle-net"; localePrefix?: "" | "/ru"; snapshotKey?: string }) {
  const lang: TalentLang = localePrefix === "/ru" ? "ru" : "en";
  const talentScenarios = useMemo(() => localizedTalentScenarios(lang), [lang]);
  const labels: Record<TalentKind, string> = { class: talentText(lang, "Класс"), hero: talentText(lang, "Герой"), spec: talentText(lang, "Специализация") };
  const baseline = useMemo(() => data ? initialSelection(data, loadout, dataMode === "fixture") : null, [data, dataMode, loadout]);
  const [selection, setSelection] = useState<Selection | null>(baseline);
  const [simulation, setSimulation] = useState<SimulationState>({ status: "loading" });
  const [activeTree, setActiveTree] = useState<TalentKind>("spec");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [automaticRanks, setAutomaticRanks] = useState<Map<string, number>>(new Map());
  useEffect(() => { setSelection(baseline); setAutomaticRanks(new Map()); }, [baseline]);
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
    if (simulationCodes?.candidate) onCandidateLoadoutChange?.(simulationCodes.candidate);
  }, [onCandidateLoadoutChange, simulationCodes?.candidate]);

  useEffect(() => {
    if (!data || !simulationCodes) return;
    const controller = new AbortController();
    setSimulation({ status: "loading" });
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
        const ready = { status: "ready" as const, ...payload, singleTargetDelta: payload.singleTargetDelta ?? 0, aoeDelta: payload.aoeDelta ?? 0 };
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
          label: `${lang === "ru" ? "Таланты" : "Talents"} · ${talentScenarios.find((entry) => entry.id === scenario)?.label ?? scenario}`,
        }).catch(() => undefined);
      }).catch((error: Error) => { if (error.name !== "AbortError") setSimulation({ status: "error", error: talentSimulationMessage(error.message, lang) }); });
    }, 650);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [characterSlug, data, dataMode, retryKey, scenario, simulationCodes, snapshotKey, specSlug, lang, talentScenarios]);

  if (!data || !baseline || !selection) return <section className={styles.shell}><div className={styles.empty}><AlertTriangle /><b>{talentText(lang, "Battle.net не отдал активный билд")}</b><span>{talentText(lang, "Мы не подставляем тестовые таланты настоящему персонажу. Переключите активную специализацию в игре, выйдите из неё и обновите профиль.")}</span></div></section>;

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
  const focusedRequirements = focused ? (focused.requiresNodeIds.length ? focused.requiresNodeIds : focused.prevNodeIds)
    .flatMap((nodeId) => {
      const requirement = tree.nodes.find((node) => node.nodeId === nodeId);
      const requirementChoice = requirement?.choices.find((choice) => choice.externalId === selection.choices.get(requirement.id)) ?? requirement?.choices[0];
      return requirement && requirementChoice ? [{ node: requirement, choice: requirementChoice }] : [];
    }) : [];

  const setRank = (node: TalentNode, requestedRank: number) => {
    if (node.freeNode) return;
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
    const totalRemoved = Math.max(0, pointsBefore - pointsAfter);
    setSelection({ ranks, choices });
    setFocusedId(node.id);
    setNotice(totalRemoved > current - nextRank
      ? lang === "ru" ? `Вместе с этим узлом дерево отключило ещё ${totalRemoved - (current - nextRank)} зависимых ранга. DPS ниже считается для всех ${totalRemoved} снятых очков.` : `The tree also removed ${totalRemoved - (current - nextRank)} dependent ranks. DPS below includes all ${totalRemoved} removed points.`
      : "");
  };

  const changeRank = (node: TalentNode) => {
    const current = selection.ranks.get(node.id) ?? 0;
    setRank(node, current >= node.maxRanks ? 0 : current + 1);
  };

  const cycleChoice = () => {
    if (!focused || focused.choices.length < 2 || !(selection.ranks.get(focused.id) ?? 0)) return;
    const index = Math.max(0, focused.choices.findIndex((choice) => choice.externalId === selection.choices.get(focused.id)));
    const choices = new Map(selection.choices);
    choices.set(focused.id, focused.choices[(index + 1) % focused.choices.length].externalId);
    setSelection({ ranks: new Map(selection.ranks), choices });
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

  return <section className={styles.shell} aria-labelledby="live-talents-heading">
    <WarcraftFrame />
    <header className={styles.header}>
      <div><small>{talentText(lang, "ТАЛАНТЫ · ")}{data.specName}</small><h2 id="live-talents-heading">{talentText(lang, "Ваш билд и его сила")}</h2><p>{talentText(lang, "Меняйте таланты и сравнивайте результат с текущим билдом персонажа.")}</p></div>
      <div className={styles.headerActions} data-folio-tools><Link href={`${localePrefix}/wow/rotation/${specSlug}?character=${encodeURIComponent(characterSlug)}&mode=${dataMode}`}><Swords /> {talentText(lang, " Настроить ротацию")}</Link><button type="button" onClick={() => { setSelection({ ranks: new Map(baseline.ranks), choices: new Map(baseline.choices), origin: baseline.origin }); setAutomaticRanks(new Map()); setNotice(""); }}><RotateCcw /> {talentText(lang, " Вернуть исходный билд")}</button></div>
    </header>
    <div className={styles.modeChooser}>
      <div><b>{talentText(lang, "Измените таланты")}</b><span>{talentText(lang, "Нажмите на талант, чтобы добавить ранг. Правый клик снимает один ранг.")}</span></div>
      <label data-folio-fields className={styles.scenarioPicker} htmlFor="character-talents-scenario"><span>{talentText(lang, "Бой для расчёта")}</span><select id="character-talents-scenario" value={scenario} onChange={(event) => { const chosen = talentScenarios.find((entry) => entry.id === event.currentTarget.value && entry.group === "PvE"); if (chosen) onScenarioChange(chosen.id); }}>
        {!talentScenarios.some((entry) => entry.id === scenario && entry.group === "PvE") ? <option value={scenario}>{scenarioLabel}</option> : null}
        {talentScenarios.filter((entry) => entry.group === "PvE").map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      </select></label>
      <div className={styles.legend}><span><i className={styles.legendAdd}><Plus /></i>{talentText(lang, "можно добавить")}</span><span><i className={styles.legendSelected}><Check /></i>{talentText(lang, "уже выбран")}</span><span><i><LockKeyhole /></i>{talentText(lang, "пока закрыт")}</span></div>
    </div>
    <div className={styles.workspace}>
      <div className={styles.builder} data-book-surface="foldout">
        <nav aria-label={talentText(lang, "Деревья талантов")}>{(Object.keys(labels) as TalentKind[]).map((kind) => <button key={kind} type="button" aria-pressed={activeTree === kind} onClick={() => { setActiveTree(kind); setFocusedId(null); }}><span className={styles.navLabelFull}>{labels[kind]}</span><span className={styles.navLabelCompact}>{kind === "spec" ? talentText(lang, "Спец.") : labels[kind]}</span><b>{spent(selection.ranks, data, kind)}/{budgets[kind]}</b></button>)}</nav>
        <div className={styles.connectionLegend} aria-label={talentText(lang, "Обозначения связей")}><span><i className={styles.lineActive} />{talentText(lang, "выбранный путь")}</span><span><i className={styles.lineAvailable} />{talentText(lang, "можно продолжить")}</span><span><b>→</b>{talentText(lang, "стрелка показывает, какой талант откроется следующим")}</span></div>
        <p className={styles.treeScrollHint} id="talent-tree-scroll-help">{talentText(lang, "Листайте дерево влево и вправо, чтобы увидеть все таланты.")}</p>
        <div className={styles.treeViewport} role="region" tabIndex={0} aria-label={`${lang === "ru" ? "Дерево талантов" : "Talent tree"}: ${labels[activeTree]}`} aria-describedby="talent-tree-scroll-help" onFocusCapture={(event) => {
          if (event.currentTarget.scrollWidth > event.currentTarget.clientWidth && event.target instanceof HTMLElement && event.target.matches(".tc-node")) {
            event.target.scrollIntoView({ block: "nearest", inline: "nearest" });
          }
        }}>
        <div className={`talent-calculator ${styles.embeddedCalculator}`} data-performance="balanced">
          <TalentTreePanel lang={lang} appearance="manuscript" specSlug={activeTree === "spec" ? theme?.slug : undefined} variant={activeTree} eyebrow={labels[activeTree]} title={activeTree === "hero" ? data.heroName : activeTree === "class" ? data.className : data.specName} iconSrc={activeTree === "hero" ? data.heroIconUrl : activeTree === "spec" ? theme?.iconUrl : theme?.classIconUrl} spent={spent(selection.ranks, data, activeTree)} budget={budgets[activeTree]} nodeCount={tree.nodes.length} scene={activeTree === "spec" && theme ? <SpecSignatureFx specSlug={theme.slug} appearance="manuscript" /> : undefined}>
            <div className="tc-tree-canvas">
              <div className={styles.flowGuide} aria-hidden="true"><b>{talentText(lang, "НАЧАЛО")}</b><span>{talentText(lang, "развитие билда")}</span><i>→</i><b>{talentText(lang, "СИЛЬНЫЕ УЗЛЫ")}</b></div>
              <svg className="tc-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <marker id={`talent-arrow-${activeTree}`} markerWidth="4" markerHeight="4" refX="3.4" refY="2" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L4,2 L0,4 Z" /></marker>
                  <marker id={`talent-arrow-active-${activeTree}`} markerWidth="4" markerHeight="4" refX="3.4" refY="2" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L4,2 L0,4 Z" /></marker>
                </defs>
                {treeEdges.map(([from, to]) => {
                  const fromSelected = (selection.ranks.get(from.id) ?? 0) > 0;
                  const toSelected = (selection.ranks.get(to.id) ?? 0) > 0;
                  const pointsToFocused = focused?.id === to.id;
                  const comesFromFocused = focused?.id === from.id;
                  const classes = [fromSelected && toSelected ? "is-lit" : "", fromSelected && !toSelected ? styles.availablePath : "", pointsToFocused || comesFromFocused ? styles.focusedPath : ""].filter(Boolean).join(" ");
                  return <line key={`${from.id}-${to.id}`} className={classes || undefined} x1={from.y} y1={100 - from.x} x2={to.y} y2={100 - to.x} markerEnd={`url(#talent-arrow-${fromSelected && toSelected ? `active-${activeTree}` : activeTree})`} />;
                })}
              </svg>
              {tree.nodes.map((node) => {
                const rank = selection.ranks.get(node.id) ?? 0;
                const state = available(node, activeTree, selection.ranks, data, lang);
                const selectedChoice = selection.choices.get(node.id);
                const choice = node.choices.find((entry) => entry.externalId === selectedChoice) ?? node.choices[0];
                const visual = talentVisualTheme(node, selectedChoice);
                return <button key={node.id} type="button" data-node-id={node.id} className={`tc-node ${node.talentType} ${node.nodeType} tc-vfx-${visual.theme}${rank ? " is-selected" : ""}${!state.ok && !rank ? " is-locked" : ""}`} style={{ left: `${node.y}%`, top: `${100 - node.x}%`, "--tc-node-delay": `${Math.min(620, 120 + node.row * 35 + node.column * 12)}ms`, "--tc-vfx-phase": `${visual.phaseMs}ms`, "--tc-vfx-speed": `${visual.durationMs}ms`, "--tc-vfx-angle": `${visual.angleDeg}deg`, "--tc-sigil-rotation": `${visual.sigilRotation}deg`, "--tc-sigil-dash": visual.sigilDash } as CSSProperties} aria-pressed={rank > 0} aria-disabled={!state.ok && !rank} aria-label={`${choice?.name ?? talentText(lang, "Талант")}, ${lang === "ru" ? "ранг" : "rank"} ${rank} ${lang === "ru" ? "из" : "of"} ${node.maxRanks}${state.reason ? `, ${state.reason}` : ""}`} title={state.reason || choice?.name} onClick={(event) => { playNodeBurst(event.currentTarget); changeRank(node); }} onContextMenu={(event) => { event.preventDefault(); if (rank) { playNodeBurst(event.currentTarget); setRank(node, rank - 1); } }} onFocus={() => setFocusedId(node.id)} onMouseEnter={() => setFocusedId(node.id)}>
                  <span className="tc-node-vfx" aria-hidden="true" />
                  <svg className={`tc-node-sigil tc-sigil-${visual.asset}`} data-vfx-asset={visual.assetId} viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path className="tc-sigil-orbit" d={visual.sigilPath} /><path className="tc-sigil-mark" d={visual.assetMark} /></svg>
                  <span className="tc-node-ring" />
                  <span className={`tc-node-art${node.nodeType === "choice" ? " is-choice" : ""}`} data-selected-choice={Math.max(0, node.choices.findIndex((entry) => entry.externalId === selectedChoice))} aria-hidden="true">{choice?.iconUrl ? <img className="tc-choice-art-selected" src={choice.iconUrl} alt="" loading="lazy" decoding="async" /> : <Sparkles />}{node.nodeType === "choice" && node.choices.length > 1 ? <span className="tc-choice-switch"><i /><i /><b>↔</b></span> : null}</span>
                  <span className="tc-node-count">{rank}/{node.maxRanks}</span>
                  <span className={styles.nodeState} aria-hidden="true">{rank ? <Check /> : state.ok ? <Plus /> : <LockKeyhole />}</span>
                  <span className={styles.nodeName} aria-hidden="true">{choice?.name}</span>
                </button>;
              })}
            </div>
          </TalentTreePanel>
        </div>
        </div>
        {notice ? <p className={styles.notice}><AlertTriangle />{notice}</p> : null}
        {focused && focusedChoice ? <article className={styles.details}>
          <img src={focusedChoice.iconUrl || "/assets/wow/icon-unverified.svg"} alt="" /><div><small className={(selection.ranks.get(focused.id) ?? 0) ? styles.statusSelected : !available(focused, activeTree, selection.ranks, data, lang).ok ? styles.statusLocked : styles.statusAvailable}>{(selection.ranks.get(focused.id) ?? 0) ? talentText(lang, "✓ В БИЛДЕ") : !available(focused, activeTree, selection.ranks, data, lang).ok ? talentText(lang, "🔒 ПОКА ЗАКРЫТ") : talentText(lang, "+ МОЖНО ДОБАВИТЬ")} · {labels[activeTree]}</small><b>{focusedChoice.name}</b><TalentDescription talent={focusedChoice} locale={localePrefix === "/ru" ? "ru" : "en"} />{focusedRequirements.length ? <div className={styles.requirements}><strong>{talentText(lang, "Связан слева с:")}</strong>{focusedRequirements.map(({ node, choice }) => <button type="button" key={node.id} onClick={() => setFocusedId(node.id)}><img src={choice.iconUrl || "/assets/wow/icon-unverified.svg"} alt="" /><span>{choice.name}<small>{(selection.ranks.get(node.id) ?? 0) > 0 ? talentText(lang, "✓ уже выбран") : talentText(lang, "нужно выбрать")}</small></span></button>)}</div> : <p className={styles.rootNode}>{talentText(lang, "Стартовый узел: предыдущий талант не требуется.")}</p>}{!(selection.ranks.get(focused.id) ?? 0) && !available(focused, activeTree, selection.ranks, data, lang).ok ? <p className={styles.lockReason}>{available(focused, activeTree, selection.ranks, data, lang).reason}</p> : null}</div>
          <div className={styles.detailActions} data-folio-tools>{focused.freeNode ? <span>{talentText(lang, "Базовый талант")}</span> : <><button type="button" disabled={!(selection.ranks.get(focused.id) ?? 0)} onClick={() => setRank(focused, (selection.ranks.get(focused.id) ?? 0) - 1)}><Minus />{talentText(lang, "−1 ранг")}</button><button type="button" disabled={(selection.ranks.get(focused.id) ?? 0) >= focused.maxRanks} onClick={() => setRank(focused, (selection.ranks.get(focused.id) ?? 0) + 1)}><Plus />{talentText(lang, "+1 ранг")}</button></>}{focused.choices.length > 1 ? <button type="button" disabled={!(selection.ranks.get(focused.id) ?? 0)} onClick={cycleChoice}>{talentText(lang, "Сменить вариант")}</button> : null}</div>
        </article> : null}
      </div>
      <aside className={styles.results} aria-live="polite">
        <div className={styles.resultHead}><span><Check />{talentText(lang, "3. Результат")}</span><small>{scenarioLabel}</small></div>
        {(simulationCodes?.editDistance ?? 0) > 1 ? <div className={styles.changeScope}><AlertTriangle /><span><b>{talentText(lang, "Считается сразу несколько изменений: ")}{simulationCodes?.editDistance}</b>{talentText(lang, "Урон сравнивается для всего нового билда, а не только для последнего нажатого таланта.")}</span></div> : null}
        {changes.length ? <TalentChangeSet lang={lang} changes={changes} /> : null}
        <div className={styles.resultsBody}>
          <section className={styles.simulationPane}>{simulation.status === "loading" ? <div className={styles.simStatus}><LoaderCircle /> <span><b>{talentText(lang, "SimulationCraft считает…")}</b>{talentText(lang, "Сравниваем исходный билд и выбранный при одинаковом шмоте и условиях.")}</span></div> : simulation.status === "error" ? <div className={`${styles.simStatus} ${styles.simError}`}><AlertTriangle /><span><b>{talentText(lang, "Расчёт не завершился")}</b>{simulation.error}<button data-folio-action type="button" onClick={() => setRetryKey((value) => value + 1)}>{talentText(lang, "Повторить расчёт")}</button></span></div> : <><ResultVerdict lang={lang} singleTarget={simulation.singleTargetDelta ?? 0} aoe={simulation.aoeDelta ?? 0} singleTargetMargin={simulation.uncertainty?.singleTargetPercent ?? 0} aoeMargin={simulation.uncertainty?.aoePercent ?? 0} scenario={scenario} /><div className={styles.damage}><Metric lang={lang} name={talentText(lang, "Одна цель")} before={simulation.baselineSingleTargetDps} after={simulation.candidateSingleTargetDps} change={simulation.singleTargetDelta ?? 0} marginDps={simulation.uncertainty?.singleTargetDps} marginPercent={simulation.uncertainty?.singleTargetPercent} /><Metric lang={lang} name={lang === "ru" ? `Вся пачка · ${simulation.encounter?.aoeTargets ?? "несколько"} целей` : `Enemy group · ${simulation.encounter?.aoeTargets ?? "multiple"} targets`} note={talentText(lang, "Суммарный DPS по всем целям")} before={simulation.baselineAoeDps} after={simulation.candidateAoeDps} change={simulation.aoeDelta ?? 0} marginDps={simulation.uncertainty?.aoeDps} marginPercent={simulation.uncertainty?.aoePercent} /></div><CalculationFacts lang={lang} simulation={simulation} /></>}</section>
          <section className={styles.statsPane}><h3>{dataMode === "battle-net" ? talentText(lang, "Характеристики персонажа") : talentText(lang, "Характеристики тестового персонажа")}</h3>
            <Stat lang={lang} name={talentText(lang, "Основная")} value={Math.round(baseStats.primary).toLocaleString(lang === "ru" ? "ru-RU" : "en-US")} change={simulation.statDeltas?.primary} />
            <Stat lang={lang} name={talentText(lang, "Критический удар")} value={`${baseStats.crit.toFixed(2)}%`} change={simulation.statDeltas?.crit} percent />
            <Stat lang={lang} name={talentText(lang, "Скорость")} value={`${baseStats.haste.toFixed(2)}%`} change={simulation.statDeltas?.haste} percent />
            <Stat lang={lang} name={talentText(lang, "Искусность")} value={`${baseStats.mastery.toFixed(2)}%`} change={simulation.statDeltas?.mastery} percent />
            <Stat lang={lang} name={talentText(lang, "Универсальность")} value={`${baseStats.versatility.toFixed(2)}%`} change={simulation.statDeltas?.versatility} percent />
            <footer><AlertTriangle /><span><b>{talentText(lang, "Числа на листе персонажа могут не измениться.")}</b> {talentText(lang, " Временные усиления от талантов учитываются в расчёте урона, даже если статические характеристики остаются прежними.")}{dataMode !== "battle-net" ? talentText(lang, " Это тестовый профиль, а не ваши предметы.") : ""}</span></footer>
          </section>
        </div>
      </aside>
    </div>
    <CharacterBuildManager lang={lang} characterSlug={characterSlug} specSlug={specSlug} dataMode={dataMode} buildVersion={data.buildVersion} currentLoadout={simulationCodes?.candidate ?? ""} scenario={scenario} onScenarioChange={onScenarioChange} onLoad={loadSavedBuild} />
    <CharacterTalentOptimizer lang={lang} data={data} characterSlug={characterSlug} specSlug={specSlug} scenario={scenario} dataMode={dataMode} resetKey={snapshotKey} onScenarioChange={onScenarioChange} onApply={loadSavedBuild} />
    <details className={styles.dataSources} data-book-disclosure><summary>{talentText(lang, "Откуда данные и как считается урон")}</summary><div><span><Check />{talentText(lang, "Таланты: ")}{baseline.origin === "battle-net" ? "Battle.net API" : talentText(lang, "тестовый импорт")}</span><span><Check />{talentText(lang, "Статы: ")}{dataMode === "battle-net" ? "Battle.net API" : talentText(lang, "эталонный профиль")}</span><span><Check />{talentText(lang, "Дерево: Raidbots")}</span><span><Check />{talentText(lang, "Урон: ")}{dataMode === "battle-net" ? talentText(lang, "SimulationCraft + ваш шмот") : talentText(lang, "SimulationCraft · эталонный шмот")}</span></div></details>
    <details className={styles.source} data-book-disclosure><summary>{talentText(lang, "Версия дерева талантов")}</summary><div>{data.source.label} {talentText(lang, " · обновление ")}{data.buildVersion} {talentText(lang, " · данные от ")}{new Date(data.source.observedAt).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US")}</div></details>
  </section>;
}

function TalentChangeSet({ lang, changes }: { lang: TalentLang; changes: TalentChange[] }) {
  const groups: Array<{ kind: TalentChange["kind"]; title: string }> = [
    { kind: "added", title: talentText(lang, "Добавлены") },
    { kind: "removed", title: talentText(lang, "Сняты вручную") },
    { kind: "automatic", title: talentText(lang, "Автоматически отключены") },
    { kind: "choice", title: talentText(lang, "Изменён вариант") },
  ];
  return <section className={styles.changeSet} aria-labelledby="talent-change-set-title">
    <header><b id="talent-change-set-title">{talentText(lang, "Что именно изменилось")}</b><small>{changes.reduce((sum, change) => sum + change.ranks, 0)} {talentText(lang, " изменённых ранга")}</small></header>
    <div>{groups.map((group) => {
      const entries = changes.filter((change) => change.kind === group.kind);
      return entries.length ? <section key={group.kind} data-kind={group.kind}><h3>{group.title}</h3>{entries.map((change) => <article key={change.id}><img src={change.iconUrl || "/assets/wow/icon-unverified.svg"} alt="" /><span><b>{change.name}</b><small>{change.detail}</small></span><em>{change.kind === "added" ? "+" : change.kind === "choice" ? "↔" : "−"}{change.kind === "choice" ? "" : change.ranks}</em></article>)}</section> : null;
    })}</div>
  </section>;
}

function ResultVerdict({ lang, singleTarget, aoe, singleTargetMargin, aoeMargin, scenario }: { lang: TalentLang; singleTarget: number; aoe: number; singleTargetMargin: number; aoeMargin: number; scenario: TalentScenarioId }) {
  const primary = scenario === "pve-aoe" || scenario === "mythic-plus" ? aoe : singleTarget;
  const primaryMargin = scenario === "pve-aoe" || scenario === "mythic-plus" ? aoeMargin : singleTargetMargin;
  const direction = (value: number, margin: number) => value > margin ? 1 : value < -margin ? -1 : 0;
  const singleDirection = direction(singleTarget, singleTargetMargin);
  const aoeDirection = direction(aoe, aoeMargin);
  if (Math.abs(singleTarget) < .005 && Math.abs(aoe) < .005) return <div className={styles.verdict}><Check /><span><b>{talentText(lang, "Это ваш текущий билд")}</b>{talentText(lang, "Вы ещё ничего не поменяли. Поэтому разница равна нулю.")}</span></div>;
  if (singleDirection > 0 && aoeDirection < 0) return <div className={styles.verdict}><AlertTriangle /><span><b>{talentText(lang, "Сильнее в одну цель, слабее по пачке")}</b>{talentText(lang, "Для AoE это не улучшение, даже если одиночный урон вырос.")}</span></div>;
  if (aoeDirection > 0 && singleDirection < 0) return <div className={styles.verdict}><AlertTriangle /><span><b>{talentText(lang, "Сильнее по пачке, слабее в босса")}</b>{talentText(lang, "Выигрыш зависит от выбранного режима, универсального улучшения нет.")}</span></div>;
  if (Math.abs(primary) <= primaryMargin) return <div className={styles.verdict}><AlertTriangle /><span><b>{talentText(lang, "Разница меньше погрешности")}</b>{talentText(lang, "Пока нельзя уверенно сказать, что этот вариант сильнее или слабее текущего.")}</span></div>;
  if (primary > primaryMargin) return <div className={`${styles.verdict} ${styles.verdictGood}`}><Check /><span><b>{talentText(lang, "Для выбранного режима стало лучше")}</b>{talentText(lang, "Прирост больше статистической погрешности. Остальные результаты показаны отдельно.")}</span></div>;
  return <div className={`${styles.verdict} ${styles.verdictBad}`}><AlertTriangle /><span><b>{talentText(lang, "Для выбранного режима стало хуже")}</b>{talentText(lang, "Верните талант или попробуйте другой вариант.")}</span></div>;
}

function Metric({ lang, name, note, before, after, change, marginDps = 0, marginPercent = 0 }: { lang: TalentLang; name: string; note?: string; before?: number; after?: number; change: number; marginDps?: number; marginPercent?: number }) {
  const conclusive = Math.abs(change) > marginPercent;
  const tone = conclusive && change > .005 ? styles.positive : conclusive && change < -.005 ? styles.negative : "";
  const explanation = !conclusive && Math.abs(change) >= .005 ? talentText(lang, "разница внутри погрешности") : change > .005 ? talentText(lang, "станет выше") : change < -.005 ? talentText(lang, "станет ниже") : talentText(lang, "не изменится");
  const absolute = Number.isFinite(before) && Number.isFinite(after) ? Math.round(after! - before!) : 0;
  return <div className={tone}><span>{name}</span>{note ? <em>{note}</em> : null}<dl><div><dt>{talentText(lang, "Сейчас")}</dt><dd>{formatDps(before, lang)}</dd></div><div><dt>{talentText(lang, "После")}</dt><dd>{formatDps(after, lang)}</dd></div></dl><b>{delta(change)}</b><small><strong>{talentText(lang, "Абсолютная разница:")}</strong> {absolute > 0 ? "+" : ""}{absolute.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")} DPS</small><small><strong>{talentText(lang, "Погрешность:")}</strong> ±{Math.round(marginDps).toLocaleString(lang === "ru" ? "ru-RU" : "en-US")} DPS · ±{marginPercent.toFixed(2)}%</small><small><strong>{talentText(lang, "Вывод:")}</strong> {explanation}</small></div>;
}

function formatDps(value: number | undefined, lang: TalentLang) {
  return Number.isFinite(value) ? `${Math.round(value!).toLocaleString(lang === "ru" ? "ru-RU" : "en-US")} DPS` : "—";
}

function CalculationFacts({ lang, simulation }: { lang: TalentLang; simulation: SimulationState }) {
  return <details className={styles.calculation} data-book-disclosure>
    <summary>{talentText(lang, "Как получили эти цифры?")}</summary>
    <div><span><b>{talentText(lang, "Сравнение")}</b>{talentText(lang, "Ваш текущий билд → выбранные таланты. Шмот, уровень и остальные условия одинаковые.")}</span><span><b>{talentText(lang, "Бой")}</b>{simulation.encounter?.duration ?? "—"} {talentText(lang, " сек., без движения: 1 цель и ")}{simulation.encounter?.aoeTargets ?? "—"} {talentText(lang, " целей.")}</span><span><b>{talentText(lang, "Точность")}</b>{simulation.iterations?.toLocaleString(lang === "ru" ? "ru-RU" : "en-US") ?? "—"} {talentText(lang, " прогонов на каждый вариант. Погрешность показана для разницы при доверии ")}{simulation.uncertainty?.confidence ?? 95}%.</span></div>
  </details>;
}

function Stat({ lang, name, value, change, percent = false }: { lang: TalentLang; name: string; value: string; change?: number; percent?: boolean }) {
  const changed = typeof change === "number" && Math.abs(change) >= .005;
  const explanation = changed ? `${change > 0 ? "+" : ""}${percent ? change.toFixed(2) : Math.round(change)}${percent ? talentText(lang, " п.п.") : ""} ${lang === "ru" ? "от талантов" : "from talents"}` : talentText(lang, "таланты не меняют");
  return <div className={styles.stat}><span>{name}</span><b>{value}</b><small>{explanation}</small></div>;
}
