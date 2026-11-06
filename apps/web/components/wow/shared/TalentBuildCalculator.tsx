"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowLeftRight, Check, Copy, LoaderCircle, Minus, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import type { TalentCalculatorData, TalentKind, TalentNode } from "@/lib/talentCalculatorData";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { decodeWoWTalentLoadout, encodeWoWTalentLoadout, FURY_REFERENCE_LOADOUT, talentPointBudgets } from "@/lib/wowTalentLoadout";
import { type TalentScenarioId } from "@/lib/wow/testCharacterTalentAudit";
import { talentSimulationIntegrityError } from "@/lib/wow/talentSimulationIntegrity";
import { TalentDescription } from "@/components/talents/TalentDescription";
import { talentSimulationMessage } from "@/components/talents/talentSimulationMessages";
import { ResilientImage } from "@/components/media/ResilientImage";
import { MaterialButton } from "@/components/wow/shared/materialAtlas";
import { TALENTS_KIT } from "@/lib/wow/charactersKit";
import tooltipStyles from "@/components/wow/audit/warcraftTooltip.module.css";
import { talentBuildCalculatorCopy as copy } from "./talentBuildCalculatorCopy";
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
  })) return { ok: false, reason: copy[lang].linkedAbove };
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

type SimulatorProps = { data: TalentCalculatorData | null; specSlug: string; loadout?: string; onCandidateLoadoutChange?: (loadout: string) => void; localePrefix?: "" | "/ru" } & (
  { mode?: "character"; characterSlug: string; baseStats?: CombatStats; scenario: TalentScenarioId; onScenarioChange: (scenario: TalentScenarioId) => void; dataMode: "fixture" | "battle-net"; snapshotKey?: string; readOnly?: never } |
  { mode: "shared"; readOnly: boolean; characterSlug?: never; baseStats?: never; scenario?: never; onScenarioChange?: never; dataMode?: never; snapshotKey?: never }
);
const keepScenario = () => {};

export function TalentBuildCalculator({ data, characterSlug = "", specSlug, loadout, baseStats = defaultStats, scenario = "mythic-plus", onScenarioChange = keepScenario, onCandidateLoadoutChange, dataMode = "battle-net", localePrefix = "/ru", snapshotKey = "initial", mode = "character", readOnly = false }: SimulatorProps) {
  const shared = mode === "shared";
  const lang: TalentLang = localePrefix === "/ru" ? "ru" : "en";
  const talentScenarios = useMemo(() => localizedTalentScenarios(lang), [lang]);
  const baseline = useMemo(() => data ? initialSelection(data, loadout, dataMode === "fixture") : null, [data, dataMode, loadout]);
  const [selection, setSelection] = useState<Selection | null>(baseline);
  const [simulationResult, setSimulation] = useState<SimulationState>({ status: "loading" });
  const [activeTree, setActiveTree] = useState<TalentKind>("spec");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [automaticRanks, setAutomaticRanks] = useState<Map<string, number>>(new Map());
  const [copied, setCopied] = useState(false);
  const tooltip = useRef<TooltipHandle>(null);
  const geometry = useMemo(() => data ? { class: treeGeometry(data.trees.class.nodes), hero: treeGeometry(data.trees.hero.nodes), spec: treeGeometry(data.trees.spec.nodes) } : null, [data]);
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

  if (!data || !baseline || !selection || !geometry) return <section className={styles.shell}><p className={styles.empty} role="status"><AlertTriangle aria-hidden="true" /><b>{talentText(lang, "Battle.net не отдал активный билд")}</b><span>{talentText(lang, "Переключите специализацию в игре и обновите профиль.")}</span></p></section>;

  const budgets = talentPointBudgets(data);
  const theme = getTalentSpecTheme(specSlug);
  const nodeById = new Map(Object.values(data.trees).flatMap((entry) => entry.nodes).map((node) => [node.id, node] as const));
  const focused = focusedId ? nodeById.get(focusedId) : undefined;
  const focusedChoice = focused?.choices.find((choice) => choice.externalId === selection.choices.get(focused.id)) ?? focused?.choices[0];
  const focusedRank = focused ? selection.ranks.get(focused.id) ?? 0 : 0;
  const focusedLock = focused && !focusedRank ? available(focused, kindOf(focused), selection.ranks, data, lang) : null;
  const edited = (simulationCodes?.editDistance ?? 0) > 0;
  const treeTitle: Record<TalentKind, string> = { class: data.className, hero: data.heroName, spec: data.specName };
  const treeIcon: Record<TalentKind, string | undefined> = { class: theme?.classIconUrl, hero: data.heroIconUrl, spec: theme?.iconUrl };
  const accent = theme ? { "--tree-accent": theme.accent, "--tree-hot": theme.hot, "--tree-rgb": theme.accentRgb } as CSSProperties : undefined;

  const setRank = (node: TalentNode, requestedRank: number) => {
    if (readOnly || node.freeNode) return;
    const kind = kindOf(node);
    const state = available(node, kind, selection.ranks, data, lang);
    const current = selection.ranks.get(node.id) ?? 0;
    const nextRank = Math.max(0, Math.min(node.maxRanks, requestedRank));
    if (nextRank > current && !state.ok) { setNotice(state.reason); return; }
    if (nextRank > current && spent(selection.ranks, data, kind) + (nextRank - current) > budgets[kind]) { setNotice(talentText(lang, "Свободных очков не хватает. Сначала уберите очко из другого таланта.")); return; }
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

  const copyBuild = () => {
    const code = simulationCodes?.candidate;
    if (!code || !navigator.clipboard) return;
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }).catch(() => undefined);
  };

  // One tooltip for all nodes: hover/focus only moves it, the trees do not re-render.
  const nodeFromEvent = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>("[data-talent-node]") : null;
  const describeNode = (id: string) => {
    const node = nodeById.get(id);
    if (!node) return null;
    const rank = selection.ranks.get(node.id) ?? 0;
    const choice = node.choices.find((entry) => entry.externalId === selection.choices.get(node.id)) ?? node.choices[0];
    const lock = rank ? null : available(node, kindOf(node), selection.ranks, data, lang);
    const others = node.choices.filter((entry) => entry !== choice);
    return <div className={styles.tip}>
      <div className={styles.tipHead}><TalentIcon src={choice?.iconUrl} size={40} /><div><b>{choice?.name ?? talentText(lang, "Талант")}</b><span>{copy[lang].rank} {rank}/{node.maxRanks}</span></div></div>
      {choice ? <TalentDescription talent={choice} locale={lang} /> : null}
      {others.length && rank ? <p className={styles.tipAlt}>{copy[lang].or} {others.map((entry) => entry.name).join(", ")}</p> : null}
      {lock && !lock.ok ? <p className={styles.tipLock}>{lock.reason}</p> : null}
    </div>;
  };

  return <section className={styles.shell} style={accent} aria-label={shared ? undefined : talentText(lang, "Таланты")} data-talent-editor={shared ? "shared" : "character"} data-read-only={readOnly || undefined}>
    {!shared && <div className={styles.toolbar}>
      <AtlasSegmented className={styles.scenario} size="sm" fullWidth aria-label={talentText(lang, "Бой")} value={scenario} onValueChange={(value) => { const chosen = talentScenarios.find((entry) => entry.id === value && entry.group === "PvE"); if (chosen) onScenarioChange(chosen.id); }} options={talentScenarios.filter((entry) => entry.group === "PvE").map((entry) => ({ value: entry.id, label: entry.shortLabel }))} />
      <div className={styles.toolbarActions}>
        {edited ? <button type="button" className={tools.quiet} onClick={restoreBaseline}><RotateCcw aria-hidden="true" />{talentText(lang, "Вернуть исходный билд")}</button> : null}
        <MaterialButton kit={TALENTS_KIT} type="button" onClick={copyBuild} disabled={!simulationCodes?.candidate} icon={copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}><span aria-live="polite">{copied ? copy[lang].copied : copy[lang].copy}</span></MaterialButton>
      </div>
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
    <nav className={styles.trees} aria-label={talentText(lang, "Деревья талантов")}>{treeKinds.map((kind) => <button key={kind} type="button" aria-pressed={activeTree === kind} onClick={() => { setActiveTree(kind); setFocusedId(null); }}><span>{treeTitle[kind]}</span><b>{spent(selection.ranks, data, kind)}/{budgets[kind]}</b></button>)}</nav>
    <div
      className={styles.forest}
      style={{ "--cells-class": geometry.class.cellsX, "--cells-hero": geometry.hero.cellsX, "--cells-spec": geometry.spec.cellsX, "--fr-class": `${geometry.class.cellsX}fr`, "--fr-hero": `${geometry.hero.cellsX}fr`, "--fr-spec": `${geometry.spec.cellsX}fr` } as CSSProperties}
      onPointerOver={(event) => { if (event.pointerType === "touch") return; const node = nodeFromEvent(event.target); if (node) tooltip.current?.show(node.dataset.talentNode!, node); else tooltip.current?.hide(); }}
      onPointerLeave={() => tooltip.current?.hide()}
      onFocus={(event) => { const node = nodeFromEvent(event.target); if (node && node.matches(":focus-visible")) tooltip.current?.show(node.dataset.talentNode!, node); }}
      onBlur={() => tooltip.current?.hide()}
      onClick={(event) => {
        const element = nodeFromEvent(event.target);
        const node = element ? nodeById.get(element.dataset.talentNode!) : undefined;
        if (!node) return;
        setFocusedId(node.id);
        // A tap opens the talent below the trees; ranks change there or with a mouse.
        if (readOnly || (event.nativeEvent as PointerEvent).pointerType === "touch") return;
        const rank = selection.ranks.get(node.id) ?? 0;
        setRank(node, rank >= node.maxRanks ? 0 : rank + 1);
      }}
      onContextMenu={(event) => {
        const element = nodeFromEvent(event.target);
        const node = element ? nodeById.get(element.dataset.talentNode!) : undefined;
        if (!node) return;
        event.preventDefault();
        const rank = selection.ranks.get(node.id) ?? 0;
        if (!readOnly && rank) setRank(node, rank - 1);
      }}
    >
      {treeKinds.map((kind) => {
        const tree = data.trees[kind];
        const shape = geometry[kind];
        const used = spent(selection.ranks, data, kind);
        return <article key={kind} className={styles.tree} data-tree={kind} data-active={activeTree === kind || undefined} aria-label={`${treeTitle[kind]}, ${used}/${budgets[kind]}`}>
          <header className={styles.treeHead}>
            <span className={styles.emblem} aria-hidden="true">{treeIcon[kind] ? <TalentIcon src={treeIcon[kind]} size={kind === "hero" ? 44 : 36} eager /> : null}</span>
            <h3>{treeTitle[kind]}</h3>
            <span className={styles.points} data-full={used >= budgets[kind] || undefined}><b>{used}</b>/{budgets[kind]}</span>
          </header>
          <div className={styles.canvas} style={{ "--cells-x": shape.cellsX, "--cells-y": shape.cellsY } as CSSProperties}>
            <svg className={styles.lines} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {shape.edges.map(([from, to]) => {
                const fromSelected = (selection.ranks.get(from.id) ?? 0) > 0;
                const toSelected = (selection.ranks.get(to.id) ?? 0) > 0;
                return <line key={`${from.id}-${to.id}`} data-state={fromSelected && toSelected ? "lit" : fromSelected ? "open" : undefined} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
              })}
            </svg>
            {tree.nodes.map((node) => {
              const rank = selection.ranks.get(node.id) ?? 0;
              const state = rank ? null : available(node, kind, selection.ranks, data, lang);
              const selectedChoice = selection.choices.get(node.id);
              const choiceIndex = Math.max(0, node.choices.findIndex((entry) => entry.externalId === selectedChoice));
              const choice = node.choices[choiceIndex] ?? node.choices[0];
              const before = baseline.ranks.get(node.id) ?? 0;
              const diff = rank > before ? "added" : rank < before ? "removed" : rank && selectedChoice !== baseline.choices.get(node.id) ? "added" : undefined;
              const split = node.nodeType === "choice" && !rank && node.choices.length > 1;
              return <button
                key={node.id}
                type="button"
                className={styles.node}
                data-talent-node={node.id}
                data-shape={nodeShape(node)}
                data-state={rank ? (rank < node.maxRanks ? "partial" : "selected") : state?.ok ? "open" : "locked"}
                data-diff={diff}
                data-focused={focusedId === node.id || undefined}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                aria-pressed={rank > 0}
                aria-disabled={!rank && !state?.ok}
                aria-label={`${node.choices.length > 1 && !rank ? node.choices.map((entry) => entry.name).join(" / ") : choice?.name ?? talentText(lang, "Талант")}, ${rank}/${node.maxRanks}${state && !state.ok ? `, ${state.reason}` : ""}`}
              >
                <span className={styles.art} aria-hidden="true">
                  {split ? <><TalentIcon src={node.choices[0].iconUrl} className={styles.splitA} /><TalentIcon src={node.choices[1].iconUrl} className={styles.splitB} /></> : <TalentIcon src={choice?.iconUrl} />}
                </span>
                {node.maxRanks > 1 ? <span className={styles.pips} aria-hidden="true">{Array.from({ length: node.maxRanks }, (_, index) => <i key={index} data-on={index < rank || undefined} />)}</span> : null}
              </button>;
            })}
          </div>
        </article>;
      })}
    </div>
    <TalentTooltip ref={tooltip} render={describeNode} />
    {notice ? <p className={tools.status} role="status"><AlertTriangle aria-hidden="true" />{notice}</p> : null}
    {focused && focusedChoice ? <article className={styles.details} data-testid="shared-talent-inspection">
      <TalentIcon src={focusedChoice.iconUrl} size={48} />
      <div><b>{focusedChoice.name}</b><TalentDescription talent={focusedChoice} locale={lang} />{focusedLock && !focusedLock.ok ? <p className={styles.lockReason}>{focusedLock.reason}</p> : null}</div>
      {!readOnly && !focused.freeNode ? <div className={styles.detailActions}>
        <button type="button" className={tools.quiet} disabled={!focusedRank} onClick={() => setRank(focused, focusedRank - 1)} aria-label={talentText(lang, "−1 ранг")}><Minus aria-hidden="true" /></button>
        <span>{focusedRank}/{focused.maxRanks}</span>
        <button type="button" className={tools.quiet} disabled={focusedRank >= focused.maxRanks} onClick={() => setRank(focused, focusedRank + 1)} aria-label={talentText(lang, "+1 ранг")}><Plus aria-hidden="true" /></button>
        {focused.choices.length > 1 ? <button type="button" className={tools.quiet} disabled={!focusedRank} onClick={cycleChoice}><ArrowLeftRight aria-hidden="true" />{talentText(lang, "Сменить вариант")}</button> : null}
      </div> : null}
    </article> : null}
    {!shared && <div className={styles.extras}>
      <CharacterTalentOptimizer lang={lang} data={data} characterSlug={characterSlug} specSlug={specSlug} scenario={scenario} dataMode={dataMode} resetKey={snapshotKey} onApply={loadSavedBuild} />
      <CharacterBuildManager lang={lang} characterSlug={characterSlug} specSlug={specSlug} dataMode={dataMode} buildVersion={data.buildVersion} currentLoadout={simulationCodes?.candidate ?? ""} scenario={scenario} onScenarioChange={onScenarioChange} onLoad={loadSavedBuild} />
    </div>}
  </section>;
}

const treeKinds: TalentKind[] = ["class", "hero", "spec"];
const kindOf = (node: TalentNode) => node.id.slice(0, node.id.indexOf("-")) as TalentKind;
const nodeShape = (node: TalentNode) => node.nodeType === "choice" ? "choice" : node.nodeType === "tiered" || node.nodeType === "subtree" ? "apex" : node.talentType === "passive" ? "round" : "square";

/** Game grid of one tree: cells across/down the canvas (node x/y are percentages) and its connections. */
function treeGeometry(nodes: TalentNode[]) {
  const step = (values: number[]) => {
    const sorted = [...new Set(values.map((value) => Math.round(value * 100) / 100))].sort((a, b) => a - b);
    const gaps = sorted.slice(1).map((value, index) => value - sorted[index]).filter((gap) => gap > 2);
    return gaps.length ? Math.min(...gaps) : 0;
  };
  const stepX = step(nodes.map((node) => node.x));
  const stepY = step(nodes.map((node) => node.y));
  const cellsY = stepY ? Math.min(16, 100 / stepY) : 3;
  const cellsX = stepX ? Math.min(12, Math.max(3, 100 / stepX)) : 4;
  const byNodeId = new Map(nodes.map((node) => [node.nodeId, node]));
  const edges = nodes.flatMap((node) => node.nextNodeIds.flatMap((nextId) => {
    const target = byNodeId.get(nextId);
    return target ? [[node, target] as const] : [];
  }));
  return { cellsX: Math.round(cellsX * 100) / 100, cellsY: Math.round(Math.max(cellsY, 2) * 100) / 100, edges };
}

const UNVERIFIED_ICON = "/assets/wow/icon-unverified.svg";
function TalentIcon({ src, size = 56, className, eager = false }: { src?: string; size?: number; className?: string; eager?: boolean }) {
  return <ResilientImage src={src || UNVERIFIED_ICON} alt="" width={size} height={size} className={className} loading={eager ? "eager" : "lazy"} draggable={false} fallback={<img src={UNVERIFIED_ICON} alt="" width={size} height={size} className={className} />} />;
}

type TooltipHandle = { show: (id: string, anchor: HTMLElement) => void; hide: () => void };
function TalentTooltip({ ref, render }: { ref: Ref<TooltipHandle>; render: (id: string) => ReactNode }) {
  const [tip, setTip] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    show: (id, anchor) => setTip((current) => current?.id === id && current.anchor === anchor ? current : { id, anchor }),
    hide: () => setTip(null),
  }), []);
  useLayoutEffect(() => {
    const element = box.current;
    if (!tip || !element) return;
    const rect = tip.anchor.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12));
    const above = rect.top - 10 - height >= 12;
    element.style.left = `${left}px`;
    element.style.top = `${above ? rect.top - 10 - height : Math.min(rect.bottom + 10, window.innerHeight - height - 12)}px`;
    element.style.visibility = "visible";
  });
  const open = Boolean(tip);
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const close = () => setTip(null);
    // Scrolling (also the scroll a keyboard focus causes) moves the tooltip with its talent.
    const follow = () => { if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; setTip((current) => current ? { ...current } : current); }); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("scroll", follow, true); window.removeEventListener("resize", close); window.removeEventListener("keydown", onKey); };
  }, [open]);
  if (!tip) return null;
  const content = render(tip.id);
  return content ? createPortal(<div ref={box} role="tooltip" className={`${tooltipStyles.tooltip} ${styles.tooltip}`} style={{ visibility: "hidden" }}>{content}</div>, document.body) : null;
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
