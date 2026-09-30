import {
  createTalentOptimizerCacheKey,
  runTalentOptimization,
  selectBoundedTalentCandidates,
  talentOptimizerEncounter,
} from "../lib/wow/talentOptimizer.ts";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const candidate = (id, loadout) => ({
  id, loadout, buildVersion: "12.1.0.69814", tree: "spec", kind: "rank-swap", editDistance: 2,
  pointBudgets: { class: 31, hero: 10, spec: 30 },
  changes: [{ nodeId: id === "good" ? 2 : 3, nodeKey: `spec-${id}`, name: id, rankDelta: 1 }],
});
const base = {
  spec: "fury-warrior", scenario: "raid", encounter: talentOptimizerEncounter("raid"),
  armoryFingerprint: "armory-A", gameBuild: "12.1.0.69814", apl: ["rampage", "bloodthirst"],
  baselineLoadout: "baseline-loadout", candidates: [candidate("bad", "bad-loadout"), candidate("good", "good-loadout")],
};
const calls = [];
const dps = { "baseline-loadout": 100_000, "bad-loadout": 90_000, "good-loadout": 110_000 };
const simulate = async (request) => {
  calls.push({ loadout: request.talentLoadout, bypassCache: request.bypassCache });
  return { dps: dps[request.talentLoadout], dpsError: 100, engine: "SimulationCraft test", iterations: 10_000, confidence: 95, fromCache: false };
};
const progress = [];
const result = await runTalentOptimization(base, simulate, new AbortController().signal, (entry) => progress.push(entry));
assert(result.baseline.dps === 100_000, "Baseline was not simulated");
assert(result.results.length === 2 && result.winner?.candidateId === "good", "Best candidate was not selected");
assert(result.verification?.dps === 110_000 && result.verifiedWinnerDpsDelta === 0, "Winner was not independently verified");
assert(calls.at(-1).loadout === "good-loadout" && calls.at(-1).bypassCache === true, "Winner verification reused the ordinary cache path");
assert(progress.at(-1).phase === "verification" && progress.at(-1).completed === 7, "Progress did not reach verification completion");
assert(result.results.every((entry) => typeof entry.singleTargetDeltaPercent === "number" && typeof entry.aoeDeltaPercent === "number"), "Top candidates are missing ST/AoE cross-checks");

const mixed = selectBoundedTalentCandidates([
  { ...candidate("class-choice", "a"), tree: "class" },
  { ...candidate("class-rank", "b"), tree: "class" },
  { ...candidate("hero-rank", "c"), tree: "hero" },
  { ...candidate("spec-rank", "d"), tree: "spec" },
].map((entry) => ({ ...entry, tree: entry.tree ?? "class", kind: entry.id.endsWith("choice") ? "choice" : "rank-swap" })), 3);
assert(mixed.map((entry) => entry.tree).join(",") === "spec,hero,class", "Bounded selection did not cover all talent trees");
assert(mixed.every((entry) => entry.kind === "rank-swap"), "Utility choices displaced rank swaps in bounded selection");

const cacheInput = {
  spec: base.spec, scenario: base.scenario, encounter: base.encounter, armoryFingerprint: base.armoryFingerprint,
  gameBuild: base.gameBuild, apl: base.apl, talentLoadout: "good-loadout",
};
const baselineKey = createTalentOptimizerCacheKey(cacheInput);
for (const changed of [
  { ...cacheInput, armoryFingerprint: "armory-B" },
  { ...cacheInput, gameBuild: "12.1.1" },
  { ...cacheInput, scenario: "mythic-plus", encounter: talentOptimizerEncounter("mythic-plus") },
  { ...cacheInput, apl: ["bloodthirst", "rampage"] },
  { ...cacheInput, talentLoadout: "bad-loadout" },
]) assert(createTalentOptimizerCacheKey(changed) !== baselineKey, "Cache key collision across optimizer inputs");

const poisoned = new Map([[baselineKey, 110_000]]);
const badKey = createTalentOptimizerCacheKey({ ...cacheInput, talentLoadout: "bad-loadout" });
assert(poisoned.get(badKey) === undefined, "Bad candidate inherited a positive delta through a cache collision");

let partialProgress = null;
let rateLimited = false;
let simulationNumber = 0;
try {
  await runTalentOptimization(base, async (request) => {
    simulationNumber += 1;
    if (simulationNumber === 3) throw Object.assign(new Error("rate limited"), { code: "rate_limited" });
    return simulate(request);
  }, new AbortController().signal, (entry) => { partialProgress = entry; });
} catch (error) { rateLimited = error?.code === "rate_limited"; }
assert(rateLimited && partialProgress?.results.length === 1, "Rate limit discarded already completed candidate results");

const controller = new AbortController();
controller.abort();
let cancelled = false;
try { await runTalentOptimization(base, simulate, controller.signal); } catch (error) { cancelled = error?.name === "AbortError"; }
assert(cancelled, "Cancelled optimizer continued running");

console.log(JSON.stringify({
  status: "passed", baseline: result.baseline.dps, winner: result.winner.candidateId,
  candidateCount: result.results.length, winnerRechecked: true, cacheIsolation: true, cancellation: true,
  partialResultsSurviveRateLimit: true,
}, null, 2));
