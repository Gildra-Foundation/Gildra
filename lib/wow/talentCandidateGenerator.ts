import type { TalentCalculatorData, TalentKind, TalentNode } from "../talentCalculatorData.ts";
import { decodeWoWTalentLoadout, encodeWoWTalentLoadout } from "../wowTalentLoadout.ts";

export type TalentSelection = { ranks: Map<string, number>; choices: Map<string, number> };
export type TalentPointBudgets = Record<TalentKind, number>;
export type TalentSelectionValidation = { valid: boolean; errors: string[]; pointBudgets: TalentPointBudgets };
export type TalentCandidate = {
  id: string;
  loadout: string;
  buildVersion: string;
  tree: TalentKind;
  kind: "choice" | "rank-swap";
  editDistance: number;
  pointBudgets: TalentPointBudgets;
  changes: Array<{ nodeId: number; nodeKey: string; name: string; rankDelta: number; choiceFrom?: number; choiceTo?: number }>;
};
export type TalentCandidateOptions = { maxCandidates?: number; maxCandidatesPerTree?: number; maxEvaluations?: number };

const treeOrder: TalentKind[] = ["class", "hero", "spec"];

function nodeIndex(data: TalentCalculatorData) {
  return new Map(treeOrder.flatMap((kind) => data.trees[kind].nodes.map((node) => [node.id, { kind, node }] as const)));
}

function selectedPoints(data: TalentCalculatorData, selection: TalentSelection): TalentPointBudgets {
  const result: TalentPointBudgets = { class: 0, hero: 0, spec: 0 };
  for (const kind of treeOrder) {
    const free = new Set(data.trees[kind].nodes.filter((node) => node.freeNode).map((node) => node.id));
    result[kind] = [...selection.ranks].filter(([id]) => id.startsWith(`${kind}-`) && !free.has(id)).reduce((sum, [, rank]) => sum + rank, 0);
  }
  return result;
}

function requirementsMet(node: TalentNode, tree: TalentNode[], ranks: Map<string, number>) {
  const requirements = node.requiresNodeIds.length ? node.requiresNodeIds : node.prevNodeIds;
  if (!requirements.length) return true;
  const byNodeId = new Map(tree.map((entry) => [entry.nodeId, entry]));
  return requirements.some((nodeId) => {
    const required = byNodeId.get(nodeId);
    return required && (ranks.get(required.id) ?? 0) > 0;
  });
}

/** Builds a small valid selection for topology property tests only. Real user
 * flows must always start from the active Battle.net loadout. */
export function createTopologyTestSelection(data: TalentCalculatorData, requested: TalentPointBudgets = { class: 8, hero: 4, spec: 8 }): TalentSelection {
  const selection: TalentSelection = { ranks: new Map(), choices: new Map() };
  for (const kind of treeOrder) {
    const tree = [...data.trees[kind].nodes].sort((left, right) => left.nodeId - right.nodeId);
    for (const node of tree.filter((entry) => entry.freeNode)) {
      selection.ranks.set(node.id, node.maxRanks);
      if (node.nodeType === "choice" && node.choices[0]) selection.choices.set(node.id, node.choices[0].externalId);
    }
    const maximum = tree.filter((node) => !node.freeNode).reduce((sum, node) => sum + node.maxRanks, 0);
    const target = Math.min(Math.max(1, requested[kind]), maximum);
    let spent = 0;
    let progress = true;
    while (spent < target && progress) {
      progress = false;
      for (const node of tree) {
        if (spent >= target) break;
        const rank = selection.ranks.get(node.id) ?? 0;
        if (node.freeNode || rank >= node.maxRanks || !requirementsMet(node, tree, selection.ranks) || (node.requiredPoints && spent - rank < node.requiredPoints)) continue;
        selection.ranks.set(node.id, rank + 1);
        if (node.nodeType === "choice" && node.choices[0]) selection.choices.set(node.id, node.choices[0].externalId);
        spent += 1;
        progress = true;
      }
    }
    if (spent !== target) throw new Error(`Unable to build topology test selection for ${data.specName}:${kind} (${spent}/${target})`);
  }
  const validation = validateTalentSelection(data, selection, selectedPoints(data, selection));
  if (!validation.valid) throw new Error(`Generated topology test selection is invalid: ${validation.errors.join(",")}`);
  return selection;
}

export function validateTalentSelection(data: TalentCalculatorData, selection: TalentSelection, expectedBudgets?: TalentPointBudgets): TalentSelectionValidation {
  const errors: string[] = [];
  const indexed = nodeIndex(data);
  for (const [id, rank] of selection.ranks) {
    const entry = indexed.get(id);
    if (!entry) { errors.push(`unknown_node:${id}`); continue; }
    if (!Number.isInteger(rank) || rank < 1 || rank > entry.node.maxRanks) errors.push(`invalid_rank:${id}:${rank}`);
  }
  for (const kind of treeOrder) {
    const tree = [...data.trees[kind].nodes].sort((left, right) => left.nodeId - right.nodeId);
    const spent = tree.filter((node) => !node.freeNode).reduce((sum, node) => sum + (selection.ranks.get(node.id) ?? 0), 0);
    for (const node of tree) {
      const rank = selection.ranks.get(node.id) ?? 0;
      if (node.freeNode && rank !== node.maxRanks) errors.push(`free_node_missing:${node.id}`);
      if (!rank) {
        if (selection.choices.has(node.id)) errors.push(`choice_without_rank:${node.id}`);
        continue;
      }
      if (!node.freeNode && !requirementsMet(node, tree, selection.ranks)) errors.push(`dependency_missing:${node.id}`);
      if (!node.freeNode && node.requiredPoints && spent - rank < node.requiredPoints) errors.push(`point_gate_locked:${node.id}`);
      if (node.nodeType === "choice") {
        const selectedChoice = selection.choices.get(node.id);
        if (!node.choices.some((choice) => choice.externalId === selectedChoice)) errors.push(`invalid_choice:${node.id}`);
      } else if (selection.choices.has(node.id)) errors.push(`choice_on_non_choice:${node.id}`);
    }
  }
  const pointBudgets = selectedPoints(data, selection);
  if (expectedBudgets) for (const kind of treeOrder) if (pointBudgets[kind] !== expectedBudgets[kind]) errors.push(`budget_mismatch:${kind}:${pointBudgets[kind]}:${expectedBudgets[kind]}`);
  return { valid: errors.length === 0, errors, pointBudgets };
}

function cloneSelection(selection: TalentSelection): TalentSelection {
  return { ranks: new Map(selection.ranks), choices: new Map(selection.choices) };
}

function choiceName(node: TalentNode, externalId: number | undefined) {
  return node.choices.find((choice) => choice.externalId === externalId)?.name ?? node.choices[0]?.name ?? `Node ${node.nodeId}`;
}

export function generateTalentCandidates(data: TalentCalculatorData, baselineLoadout: string, options: TalentCandidateOptions = {}): TalentCandidate[] {
  const baseline = decodeWoWTalentLoadout(data, baselineLoadout);
  if (!baseline) throw new Error("Baseline talent loadout cannot be decoded for this specialization");
  const baselineValidation = validateTalentSelection(data, baseline);
  if (!baselineValidation.valid) throw new Error(`Baseline talent loadout is invalid: ${baselineValidation.errors.join(",")}`);

  const maxCandidates = Math.max(1, Math.min(512, options.maxCandidates ?? 128));
  const maxCandidatesPerTree = Math.max(1, Math.min(maxCandidates, options.maxCandidatesPerTree ?? 64));
  const maxEvaluations = Math.max(maxCandidates, Math.min(50_000, options.maxEvaluations ?? 10_000));
  const candidates: TalentCandidate[] = [];
  const seen = new Set([baselineLoadout]);
  const perTree: TalentPointBudgets = { class: 0, hero: 0, spec: 0 };
  let evaluations = 0;

  const emit = (selection: TalentSelection, candidate: Omit<TalentCandidate, "loadout" | "buildVersion" | "pointBudgets">) => {
    if (candidates.length >= maxCandidates || perTree[candidate.tree] >= maxCandidatesPerTree || evaluations >= maxEvaluations) return;
    evaluations += 1;
    const validation = validateTalentSelection(data, selection, baselineValidation.pointBudgets);
    if (!validation.valid) return;
    const loadout = encodeWoWTalentLoadout(data, selection.ranks, selection.choices);
    if (seen.has(loadout)) return;
    const decoded = decodeWoWTalentLoadout(data, loadout);
    if (!decoded || !validateTalentSelection(data, decoded, baselineValidation.pointBudgets).valid) return;
    seen.add(loadout);
    perTree[candidate.tree] += 1;
    candidates.push({ ...candidate, loadout, buildVersion: data.buildVersion, pointBudgets: validation.pointBudgets });
  };

  for (const kind of treeOrder) {
    const tree = [...data.trees[kind].nodes].sort((left, right) => left.nodeId - right.nodeId);
    for (const node of tree.filter((entry) => entry.nodeType === "choice" && (baseline.ranks.get(entry.id) ?? 0) > 0)) {
      const current = baseline.choices.get(node.id);
      for (const alternative of [...node.choices].sort((left, right) => left.externalId - right.externalId)) {
        if (alternative.externalId === current) continue;
        const selection = cloneSelection(baseline);
        selection.choices.set(node.id, alternative.externalId);
        emit(selection, {
          id: `${kind}:choice:${node.nodeId}:${alternative.externalId}`, tree: kind, kind: "choice", editDistance: 1,
          changes: [{ nodeId: node.nodeId, nodeKey: node.id, name: alternative.name, rankDelta: 0, choiceFrom: current, choiceTo: alternative.externalId }],
        });
      }
    }

    const selectedSources = tree.filter((node) => !node.freeNode && (baseline.ranks.get(node.id) ?? 0) > 0);
    const targets = tree.filter((node) => !node.freeNode && (baseline.ranks.get(node.id) ?? 0) < node.maxRanks);
    for (const source of selectedSources) {
      const removed = cloneSelection(baseline);
      const sourceRank = removed.ranks.get(source.id) ?? 0;
      if (sourceRank > 1) removed.ranks.set(source.id, sourceRank - 1);
      else { removed.ranks.delete(source.id); removed.choices.delete(source.id); }
      if (!validateTalentSelection(data, removed).valid) continue;

      for (const target of targets) {
        if (target.id === source.id || candidates.length >= maxCandidates || evaluations >= maxEvaluations) continue;
        const choiceVariants = target.nodeType === "choice" && !(removed.ranks.get(target.id) ?? 0)
          ? [...target.choices].sort((left, right) => left.externalId - right.externalId).map((choice) => choice.externalId)
          : [removed.choices.get(target.id)];
        for (const targetChoice of choiceVariants) {
          const selection = cloneSelection(removed);
          selection.ranks.set(target.id, (selection.ranks.get(target.id) ?? 0) + 1);
          if (target.nodeType === "choice" && targetChoice) selection.choices.set(target.id, targetChoice);
          emit(selection, {
            id: `${kind}:swap:${source.nodeId}:${target.nodeId}:${targetChoice ?? 0}`, tree: kind, kind: "rank-swap", editDistance: 2,
            changes: [
              { nodeId: source.nodeId, nodeKey: source.id, name: choiceName(source, baseline.choices.get(source.id)), rankDelta: -1 },
              { nodeId: target.nodeId, nodeKey: target.id, name: choiceName(target, targetChoice), rankDelta: 1, choiceTo: targetChoice },
            ],
          });
        }
      }
    }
  }
  return candidates;
}
