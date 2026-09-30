import { createHash } from "node:crypto";

import type { TalentCandidate } from "./talentCandidateGenerator.ts";

export type TalentOptimizerScenario = "solo-pve" | "pve-aoe" | "mythic-plus" | "raid";
export type TalentOptimizerEncounter = { duration: number; targets: number; simcScenario: "single-target" | "aoe" };
export type TalentOptimizerSimulation = {
  dps: number;
  dpsError: number;
  engine: string;
  iterations: number;
  confidence: number;
  fromCache: boolean;
};
export type TalentOptimizerResult = {
  candidateId: string;
  loadout: string;
  tree: TalentCandidate["tree"];
  kind: TalentCandidate["kind"];
  changes: TalentCandidate["changes"];
  dps: number;
  dpsError: number;
  deltaDps: number;
  deltaPercent: number;
  marginDps: number;
  significant: boolean;
  fromCache: boolean;
  singleTargetDps?: number;
  singleTargetDeltaPercent?: number;
  aoeDps?: number;
  aoeDeltaPercent?: number;
};
export type TalentOptimizerProgress = {
  phase: "baseline" | "candidates" | "crosscheck" | "verification";
  completed: number;
  total: number;
  results: TalentOptimizerResult[];
};
export type TalentOptimizerRunInput = {
  spec: string;
  scenario: TalentOptimizerScenario;
  encounter: TalentOptimizerEncounter;
  armoryFingerprint: string;
  gameBuild: string;
  apl: string[];
  baselineLoadout: string;
  candidates: TalentCandidate[];
};
export type TalentOptimizerSimulationRequest = {
  spec: string;
  scenario: TalentOptimizerScenario;
  encounter: TalentOptimizerEncounter;
  armoryFingerprint: string;
  gameBuild: string;
  apl: string[];
  talentLoadout: string;
  bypassCache: boolean;
  signal: AbortSignal;
};
export type TalentOptimizerRunResult = {
  baseline: TalentOptimizerSimulation;
  results: TalentOptimizerResult[];
  winner: TalentOptimizerResult | null;
  verification: TalentOptimizerSimulation | null;
  verifiedWinnerDpsDelta: number | null;
};

export function talentOptimizerEncounter(scenario: TalentOptimizerScenario): TalentOptimizerEncounter {
  const encounters: Record<TalentOptimizerScenario, TalentOptimizerEncounter> = {
    "solo-pve": { duration: 45, targets: 1, simcScenario: "single-target" },
    "pve-aoe": { duration: 45, targets: 8, simcScenario: "aoe" },
    "mythic-plus": { duration: 60, targets: 5, simcScenario: "aoe" },
    raid: { duration: 180, targets: 1, simcScenario: "single-target" },
  };
  return encounters[scenario];
}

export function createTalentOptimizerCacheKey(input: Omit<TalentOptimizerSimulationRequest, "signal" | "bypassCache">) {
  return createHash("sha256").update(JSON.stringify({
    armoryFingerprint: input.armoryFingerprint,
    gameBuild: input.gameBuild,
    spec: input.spec,
    scenario: input.scenario,
    encounter: input.encounter,
    apl: input.apl,
    talentLoadout: input.talentLoadout,
  })).digest("hex");
}

export function selectBoundedTalentCandidates(candidates: TalentCandidate[], limit: number) {
  const maximum = Math.max(1, Math.min(24, Math.floor(limit)));
  const treeOrder: TalentCandidate["tree"][] = ["spec", "hero", "class"];
  const buckets = new Map(treeOrder.map((tree) => [tree, candidates
    .filter((candidate) => candidate.tree === tree)
    .sort((left, right) => Number(right.kind === "rank-swap") - Number(left.kind === "rank-swap") || left.id.localeCompare(right.id))]));
  const selected: TalentCandidate[] = [];
  let offset = 0;
  while (selected.length < maximum) {
    let added = false;
    for (const tree of treeOrder) {
      const candidate = buckets.get(tree)?.[offset];
      if (!candidate) continue;
      selected.push(candidate);
      added = true;
      if (selected.length >= maximum) break;
    }
    if (!added) break;
    offset += 1;
  }
  return selected;
}

function resultFor(candidate: TalentCandidate, simulation: TalentOptimizerSimulation, baseline: TalentOptimizerSimulation, encounter: TalentOptimizerEncounter): TalentOptimizerResult {
  const deltaDps = simulation.dps - baseline.dps;
  const marginDps = 1.96 * Math.hypot(simulation.dpsError, baseline.dpsError);
  const result: TalentOptimizerResult = {
    candidateId: candidate.id,
    loadout: candidate.loadout,
    tree: candidate.tree,
    kind: candidate.kind,
    changes: candidate.changes,
    dps: simulation.dps,
    dpsError: simulation.dpsError,
    deltaDps,
    deltaPercent: baseline.dps > 0 ? deltaDps / baseline.dps * 100 : 0,
    marginDps,
    significant: Math.abs(deltaDps) > marginDps,
    fromCache: simulation.fromCache,
  };
  if (encounter.simcScenario === "aoe") {
    result.aoeDps = simulation.dps;
    result.aoeDeltaPercent = result.deltaPercent;
  } else {
    result.singleTargetDps = simulation.dps;
    result.singleTargetDeltaPercent = result.deltaPercent;
  }
  return result;
}

export function talentOptimizerTotal(candidateCount: number) {
  return candidateCount + Math.min(3, candidateCount) + 3;
}

export async function runTalentOptimization(
  input: TalentOptimizerRunInput,
  simulate: (request: TalentOptimizerSimulationRequest) => Promise<TalentOptimizerSimulation>,
  signal: AbortSignal,
  onProgress?: (progress: TalentOptimizerProgress) => void,
): Promise<TalentOptimizerRunResult> {
  const total = talentOptimizerTotal(input.candidates.length);
  const request = (talentLoadout: string, encounter = input.encounter, bypassCache = false) => simulate({
    ...input,
    encounter,
    talentLoadout,
    bypassCache,
    signal,
  });
  const baseline = await request(input.baselineLoadout);
  signal.throwIfAborted();
  onProgress?.({ phase: "baseline", completed: 1, total, results: [] });

  const results: TalentOptimizerResult[] = [];
  for (const candidate of input.candidates) {
    signal.throwIfAborted();
    const simulation = await request(candidate.loadout);
    results.push(resultFor(candidate, simulation, baseline, input.encounter));
    onProgress?.({ phase: "candidates", completed: results.length + 1, total, results: [...results] });
  }
  results.sort((left, right) => right.dps - left.dps || left.candidateId.localeCompare(right.candidateId));
  const winner = results[0] ?? null;
  if (!winner) return { baseline, results, winner: null, verification: null, verifiedWinnerDpsDelta: null };

  const crossEncounter: TalentOptimizerEncounter = input.encounter.simcScenario === "aoe"
    ? { duration: input.encounter.duration, targets: 1, simcScenario: "single-target" }
    : { duration: input.encounter.duration, targets: 5, simcScenario: "aoe" };
  const crossBaseline = await request(input.baselineLoadout, crossEncounter);
  onProgress?.({ phase: "crosscheck", completed: input.candidates.length + 2, total, results: [...results] });
  for (const entry of results.slice(0, 3)) {
    signal.throwIfAborted();
    const crossSimulation = await request(entry.loadout, crossEncounter);
    const crossDelta = crossBaseline.dps > 0 ? (crossSimulation.dps - crossBaseline.dps) / crossBaseline.dps * 100 : 0;
    if (crossEncounter.simcScenario === "aoe") {
      entry.aoeDps = crossSimulation.dps;
      entry.aoeDeltaPercent = crossDelta;
    } else {
      entry.singleTargetDps = crossSimulation.dps;
      entry.singleTargetDeltaPercent = crossDelta;
    }
    onProgress?.({ phase: "crosscheck", completed: input.candidates.length + 2 + results.slice(0, 3).indexOf(entry) + 1, total, results: [...results] });
  }

  signal.throwIfAborted();
  const verification = await request(winner.loadout, input.encounter, true);
  onProgress?.({ phase: "verification", completed: total, total, results: [...results] });
  return {
    baseline,
    results,
    winner,
    verification,
    verifiedWinnerDpsDelta: verification.dps - winner.dps,
  };
}
