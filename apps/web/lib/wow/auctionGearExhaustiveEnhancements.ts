import "server-only";
import { createHash } from "node:crypto";
import { createAuctionGearEnhancedLoadoutIterator, type AuctionGearEnhancedLoadoutState } from "./auctionGearEnhancedLoadouts";
import { evaluateAuctionEnhancementStage, type AuctionEnhancedRecommendation, type AuctionEnhancementStageResult, type AuctionEnhancementStageState } from "./auctionGearEnhancementStage";
import { auctionEnhancementCatalogInfo } from "./auctionEnhancementCatalog";
import { exactCommodityPrices } from "./auctionBrowserData";
import { assertFreshMarket } from "./auctionMarket";
import { compareGearSimulationResults } from "./gearSimulation";
import type { AuctionGearOption, GearPlanSimulation } from "./auctionGearTypes";
import { auctionGearSlots } from "./auctionGearSelection";

type Leader = { recommendation: AuctionEnhancedRecommendation; options: AuctionGearOption[] };
export type AuctionGearExhaustiveEnhancementState = {
  version: 1; inputKey: string; cursor: AuctionGearEnhancedLoadoutState;
  currentOptionIds?: string[]; stage: AuctionEnhancementStageState;
  /** Price basis of global ranking, independent of an in-flight stage refresh. */
  quoteSignatures?: Record<string, string>;
  equipmentChecked: number; reasons: string[]; unavailable: boolean;
  measured?: Leader; value?: Leader; dps?: Leader; runnerUp?: Leader; nextMeasured?: Leader;
  precise?: Record<string, GearPlanSimulation>;
};
type StageInput = Parameters<typeof evaluateAuctionEnhancementStage>[0];
type Input = Omit<StageInput, "finalists" | "state"> & {
  options: AuctionGearOption[]; selectedSlots?: string[];
  recheck?: (options: AuctionGearOption[], configuration: AuctionEnhancedRecommendation["configuration"], signal: AbortSignal) => Promise<GearPlanSimulation>;
  state?: AuctionGearExhaustiveEnhancementState;
  onState: (state: AuctionGearExhaustiveEnhancementState) => void;
  onUpdate?: (result: AuctionEnhancementStageResult) => Promise<void>;
};
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const betterDps = (candidate: Leader, previous?: Leader) => !previous || candidate.recommendation.simulation.dps > previous.recommendation.simulation.dps ||
  candidate.recommendation.simulation.dps === previous.recommendation.simulation.dps &&
  (candidate.recommendation.configuration.totalCopper! < previous.recommendation.configuration.totalCopper! ||
    candidate.recommendation.configuration.totalCopper === previous.recommendation.configuration.totalCopper &&
    candidate.recommendation.configuration.key < previous.recommendation.configuration.key);
// Distinct lots can buy identical gear. Their price determines which receipt to
// keep, but a second receipt cannot be an independent simulation finalist.
function sameLoadout(a: Leader, b: Leader) {
  const identity = (row: Leader) => JSON.stringify([row.options.map(option => [option.candidate.slotType, option.candidate.itemId, option.variantKey]).sort(),
    row.recommendation.configuration.slots.map(slot => [slot.slotType, slot.variantKey, slot.enchantId, slot.gemIds]).sort()]);
  return a.recommendation.configuration.key === b.recommendation.configuration.key || identity(a) === identity(b);
}
function validRecheck(result: GearPlanSimulation, original: GearPlanSimulation) {
  return result && result.engine === original.engine && result.confidence === 95 &&
    Number.isFinite(result.dpsError) && result.dpsError >= 0 && Number.isFinite(result.dps) && result.dps > 0 &&
    Number.isSafeInteger(result.iterations) && result.iterations > original.iterations;
}
function consider(state: AuctionGearExhaustiveEnhancementState, recommendation: AuctionEnhancedRecommendation, options: AuctionGearOption[], retainPair: boolean) {
  if (recommendation.configuration.status !== "priced" || recommendation.configuration.totalCopper === null) return;
  const candidate = { recommendation: structuredClone(recommendation), options: structuredClone(options) };
  if (retainPair && (!state.nextMeasured || betterDps(candidate, state.nextMeasured))) {
    const top = [state.measured, state.runnerUp, state.nextMeasured].filter((leader): leader is Leader => Boolean(leader));
    const duplicate = top.findIndex(leader => sameLoadout(candidate, leader));
    if (duplicate < 0 || betterDps(candidate, top[duplicate])) {
      if (duplicate >= 0) top.splice(duplicate, 1);
      top.push(candidate);
      [state.measured, state.runnerUp, state.nextMeasured] = top.sort((a, b) => betterDps(a, b) ? -1 : betterDps(b, a) ? 1 : 0);
    }
  } else if (!retainPair && betterDps(candidate, state.measured)) state.measured = candidate;
  if (recommendation.comparison.deltaDps <= 0 || !recommendation.comparison.uncertainty.significant) return;
  if (betterDps(candidate, state.dps)) state.dps = candidate;
  const score = recommendation.configuration.totalCopper / recommendation.comparison.deltaDps;
  const prior = state.value ? state.value.recommendation.configuration.totalCopper! / state.value.recommendation.comparison.deltaDps : Infinity;
  if (score < prior || score === prior && betterDps(candidate, state.value)) state.value = candidate;
}
function recommendations(state: AuctionGearExhaustiveEnhancementState, objective: Input["objective"]) {
  const candidates = [objective === "value" ? state.value : state.dps, state.measured, state.value, state.dps];
  return [...new Map(candidates.filter((leader): leader is Leader => Boolean(leader)).map(leader => [leader.recommendation.configuration.key, leader.recommendation])).values()];
}
function restamp(state: AuctionGearExhaustiveEnhancementState) {
  const sourceUpdatedAt = state.stage.quotes?.sourceUpdatedAt;
  if (!sourceUpdatedAt) return;
  for (const leader of [state.measured, state.value, state.dps, state.runnerUp, state.nextMeasured]) if (leader) {
    leader.recommendation = { ...leader.recommendation, configuration: { ...leader.recommendation.configuration, sourceUpdatedAt } };
  }
}
function staleQuotes(quotes: AuctionEnhancementStageState["quotes"]) {
  if (!quotes) return false;
  try { assertFreshMarket({ sourceUpdatedAt: quotes.sourceUpdatedAt ?? "" }); return false; }
  catch { return true; }
}

/** At most one current equipment set plus five leaders survive a turn. Exact
 * enhancement checkpoints are discarded only after that set is exhausted. */
export async function advanceAuctionGearExhaustiveEnhancements(input: Input): Promise<{ state: AuctionGearExhaustiveEnhancementState; result: AuctionEnhancementStageResult }> {
  input.signal.throwIfAborted();
  const iterator = createAuctionGearEnhancedLoadoutIterator({ options: input.options, selectedSlots: input.selectedSlots ?? [...auctionGearSlots],
    loadout: input.loadout, equipment: input.equipment, specId: input.specId, budgetCopper: input.budgetCopper });
  const inputKey = hash(["owned-enhancements-partial-coverage-v1", iterator.inputKey, input.profileFingerprint, input.engine, input.encounter, input.objective, input.baseline, auctionEnhancementCatalogInfo.revision, ...(input.recheck ? ["finalist-precision-v2"] : [])]);
  const initial = (stage: AuctionEnhancementStageState = { checkpoints: {} }): AuctionGearExhaustiveEnhancementState => ({
    version: 1, inputKey, cursor: iterator.initialState(), stage, equipmentChecked: 0, reasons: [], unavailable: false,
  });
  let state = input.state?.version === 1 && input.state.inputKey === inputKey ? input.state : initial();
  // Validate even an exhausted restored cursor without advancing it. Completed
  // state must satisfy the same mixed-radix ordinal proof as an active cursor.
  await iterator.nextBatch(state.cursor, { maxAssignments: 1, maxResults: 1, signal: input.signal, shouldYield: () => true });
  if (!Number.isSafeInteger(state.equipmentChecked) || state.equipmentChecked < 0 ||
      !Array.isArray(state.reasons) || !state.stage || typeof state.stage.checkpoints !== "object" ||
      state.currentOptionIds !== undefined && (!Array.isArray(state.currentOptionIds) || state.currentOptionIds.length > 16 ||
        new Set(state.currentOptionIds).size !== state.currentOptionIds.length)) throw new Error("invalid_enhancement_checkpoint");
  input.onState(state);
  const resetPrices = () => {
    state = initial({ checkpoints: {}, quotes: state.stage.quotes, quotedItemIds: state.stage.quotedItemIds });
    input.onState(state);
  };
  const acceptQuotes = () => {
    const quotes = state.stage.quotes;
    if (!quotes) return false;
    const changed = Boolean(state.quoteSignatures && Object.entries(state.quoteSignatures).some(([id, signature]) => hash(quotes.prices[id] ?? null) !== signature));
    if (changed) resetPrices();
    state.quoteSignatures = Object.fromEntries((state.stage.quotedItemIds ?? []).map(id => [String(id), hash(quotes.prices[String(id)] ?? null)]));
    input.onState(state);
    return changed;
  };
  // A quote fetch can mutate stage state before a later abort. Compare against
  // the persisted ranking basis, not just this invocation's local old value.
  acceptQuotes();
  const contenders = (): Leader[] => {
    if (!input.recheck || !state.cursor.exhausted || state.currentOptionIds !== undefined || !state.measured || !state.runnerUp) return [];
    const pair = [state.measured, state.runnerUp];
    const [a, b] = pair.map(row => row.recommendation);
    if (compareGearSimulationResults(a.simulation, b.simulation).uncertainty.significant) return [];
    const refinedA = state.precise?.[a.configuration.key], refinedB = state.precise?.[b.configuration.key];
    if (refinedA && refinedB && state.nextMeasured) {
      const leading = refinedA.dps >= refinedB.dps ? refinedA : refinedB;
      const next = state.nextMeasured.recommendation.simulation;
      if (next.dps >= leading.dps || !compareGearSimulationResults(leading, next).uncertainty.significant) pair.push(state.nextMeasured);
    }
    return pair;
  };
  const finish = (): { state: AuctionGearExhaustiveEnhancementState; result: AuctionEnhancementStageResult } => {
    const group = contenders();
    const refined = group.flatMap(leader => {
      const simulation = state.precise?.[leader.recommendation.configuration.key];
      if (!simulation) return [];
      if (!validRecheck(simulation, leader.recommendation.simulation)) throw new Error("invalid_enhancement_checkpoint");
      return [{ ...leader.recommendation, simulation }];
    });
    const complete = state.cursor.exhausted && state.currentOptionIds === undefined && group.length === refined.length;
    let all = recommendations(state, input.objective);
    let finalistRecheck: AuctionEnhancementStageResult["finalistRecheck"];
    if (complete && refined.length) {
      const baselineIndex = group.findIndex(leader => !leader.options.length && !leader.recommendation.configuration.ownedChanges?.length);
      const baseline = refined[baselineIndex]?.simulation ?? input.baseline;
      const confirmed = (row: AuctionEnhancedRecommendation) => row.comparison.deltaDps > 0 && row.comparison.uncertainty.significant;
      const candidates = new Map(all.map(row => [row.configuration.key, baselineIndex < 0 ? row :
        { ...row, comparison: compareGearSimulationResults(baseline, row.simulation) }]));
      for (const row of refined) {
        row.comparison = compareGearSimulationResults(baseline, row.simulation);
        candidates.set(row.configuration.key, row);
      }
      const byDps = [...refined].sort((a, b) => b.simulation.dps - a.simulation.dps || a.configuration.totalCopper! - b.configuration.totalCopper!);
      const leading = byDps[0];
      // Compare every member directly to the highest refined mean. Overlapping
      // intervals against an intermediate candidate cannot create a chain of ties.
      const comparisons = byDps.slice(1).map(row => ({ row, ...compareGearSimulationResults(leading.simulation, row.simulation).uncertainty }));
      const tied = [leading, ...comparisons.filter(row => !row.significant).map(entry => entry.row)];
      const preferred = [...tied].sort((a, b) => Number(confirmed(b)) - Number(confirmed(a)) ||
        a.configuration.totalCopper! - b.configuration.totalCopper! || b.simulation.dps - a.simulation.dps)[0];
      finalistRecheck = { keys: refined.map(row => row.configuration.key), leaderKey: leading.configuration.key,
        indistinguishableKeys: tied.map(row => row.configuration.key), preferredKey: preferred.configuration.key,
        significant: tied.length === 1, marginDps: comparisons[0].marginDps };
      const dearerTies = new Set(tied.filter(row => row.configuration.totalCopper! > preferred.configuration.totalCopper!)
        .map(row => row.configuration.key));
      all = [...candidates.values()].sort((a, b) => {
        const confirmation = Number(confirmed(b)) - Number(confirmed(a));
        if (confirmation) return confirmation;
        const premium = Number(dearerTies.has(a.configuration.key)) - Number(dearerTies.has(b.configuration.key));
        if (premium) return premium;
        if (input.objective === "value" && confirmed(a) && confirmed(b)) {
          const difference = a.configuration.totalCopper! / a.comparison.deltaDps - b.configuration.totalCopper! / b.comparison.deltaDps;
          if (difference) return difference;
        }
        const preference = Number(b === preferred) - Number(a === preferred);
        return preference || b.simulation.dps - a.simulation.dps || a.configuration.totalCopper! - b.configuration.totalCopper!;
      });
    }
    const fresh = all.filter(row => {
      try { assertFreshMarket({ sourceUpdatedAt: row.configuration.sourceUpdatedAt ?? "" }); return true; }
      catch { return false; }
    });
    if (fresh.length < all.length) throw new Error("market_stale");
    const reasons = [...state.reasons];
    return { state, result: { traversal: "exhaustive", includesOwnedEquipment:true, equipmentChecked: state.equipmentChecked, complete,
      status: !complete ? "pending" : fresh.length ? "ready" : state.unavailable ? "unavailable" : "no_affordable_configuration",
      ...(finalistRecheck ? { finalistRecheck } : {}), searchLimited: true, reasons, recommendations: fresh, catalogRevision: auctionEnhancementCatalogInfo.revision } };
  };
  // An exhausted cursor may be reopened when authoritative prices change. A
  // timestamp refresh alone does not invalidate expensive native measurements.
  if (state.stage.quotes && state.stage.quotedItemIds?.length &&
      (staleQuotes(state.stage.quotes) || !Number.isFinite(Date.parse(state.stage.quotes.fetchedAt)) || Date.now() - Date.parse(state.stage.quotes.fetchedAt) > 60_000)) {
    state.stage.quotes = await (input.quote ?? exactCommodityPrices)(input.region, state.stage.quotedItemIds, { refresh: true, signal: input.signal });
    input.signal.throwIfAborted();
    if (!acceptQuotes()) restamp(state);
    input.onState(state);
    if (staleQuotes(state.stage.quotes)) throw new Error("market_stale");
  }
  let lastUpdate: ReturnType<typeof finish> | undefined;
  // Reserve each slice's maximum native budget, including empty/cache slices.
  // Confirmed capacity two must not double the per-turn work allowance.
  const sliceBudget = input.simulationConcurrency === 2 ? 2 : 1;
  for (let turns = 0; turns < 8; turns += sliceBudget) {
    // Entering another slice may change the cursor or prices without producing
    // an update. Only reuse a snapshot when no later slice has touched state.
    lastUpdate = undefined;
    if (state.currentOptionIds === undefined && !state.cursor.exhausted) {
      const batch = await iterator.nextBatch(state.cursor, { maxAssignments: 128, maxResults: 1, signal: input.signal, shouldYield: input.shouldYield });
      state.cursor = batch.state;
      const current = batch.loadouts[0];
      if (current) { state.currentOptionIds = current.options.map(option => option.id); state.stage.checkpoints = {}; }
      input.onState(state);
    }
    if (state.currentOptionIds === undefined) {
      const next = contenders().find(row => !state.precise?.[row.recommendation.configuration.key]);
      if (!next || !input.recheck || input.shouldYield()) break;
      const row = next.recommendation;
      const simulation = await input.recheck(next.options, row.configuration, input.signal);
      input.signal.throwIfAborted();
      if (simulation.engine !== row.simulation.engine) throw new Error("simulation_version_changed");
      if (!validRecheck(simulation, row.simulation)) throw new Error("invalid_simulation_result");
      (state.precise ??= {})[row.configuration.key] = simulation;
      input.onState(state);
      lastUpdate = finish();
      await input.onUpdate?.(lastUpdate.result);
      input.signal.throwIfAborted();
      if (lastUpdate.result.complete || input.shouldYield()) return lastUpdate;
      continue;
    }
    const byId = new Map(input.options.map(option => [option.id, option]));
    const selected = state.currentOptionIds.map(id => byId.get(id));
    if (!selected.every((option): option is AuctionGearOption => Boolean(option))) throw new Error("invalid_enhancement_checkpoint");
    const result = await evaluateAuctionEnhancementStage({ ...input, exhaustive: true, includeObjectiveAlternatives: true, includePrecisionContenders: Boolean(input.recheck),
      finalists: [{ label: "exhaustive", options: selected }], state: state.stage });
    input.signal.throwIfAborted();
    if (result.reasons.includes("market_unverified") || staleQuotes(state.stage.quotes)) {
      // A missing fresh market is not a visited equipment set. Keep this exact
      // assignment/checkpoint for an explicit retry, without automatic spinning.
      input.onState(state);
      throw new Error("market_stale");
    }
    // New quote IDs cannot change prior sets; changed existing ladders can alter
    // affordability or value anywhere in the domain, so no old ranking survives.
    if (acceptQuotes()) break;
    restamp(state);
    for (const recommendation of result.recommendations) consider(state, recommendation, selected, Boolean(input.recheck));
    state.reasons = [...new Set([...state.reasons, ...result.reasons])];
    if (result.complete) {
      state.equipmentChecked++;
      state.unavailable ||= result.status === "unavailable";
      state.currentOptionIds = undefined;
      state.stage.checkpoints = {};
    }
    input.onState(state);
    const update = finish();
    await input.onUpdate?.(update.result);
    input.signal.throwIfAborted();
    lastUpdate = update;
    if (update.result.complete || input.shouldYield()) return update;
  }
  // Revalidate freshness after the durable callback, but preserve the identity
  // of its exact snapshot so the runner need not save/publish it a second time.
  const final = finish();
  return lastUpdate ?? final;
}
