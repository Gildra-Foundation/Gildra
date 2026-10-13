import assert from "node:assert/strict";
import { generateAplCandidates, meaningfulDpsGain, verificationTolerance } from "../lib/platform/rotation/aplOptimizer.ts";

const workerURL = (process.env.ROTATION_WORKER_URL ?? "http://127.0.0.1:58082").replace(/\/$/, "");
const appURL = (process.env.ROTATION_QA_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const presetResponse = await fetch(`${workerURL}/v1/wow/rotation/fury-warrior?locale=en_US`);
assert.equal(presetResponse.status, 200);
const preset = await presetResponse.json();
const search = generateAplCandidates({ aplRules: preset.defaultAplRules, scenario: "single-target", targets: 1, allowedAbilities: preset.abilities.map((ability) => ability.id), options: preset.aplOptions, limit: 8 });

async function simulate(scenario, targets, rules, aplRules) {
  const response = await fetch(`${workerURL}/v1/wow/rotation/simulations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec: "fury-warrior", scenario, fightLengthSeconds: 30, targets, rules, aplRules }) });
  const payload = await response.json();
  assert.equal(response.status, 201, JSON.stringify(payload));
  assert(String(payload.engine).startsWith("SimulationCraft"));
  assert(payload.dps > 0);
  return payload;
}

const measured = [];
for (const candidate of search.candidates) measured.push({ candidate, result: await simulate("single-target", 1, candidate.rules, candidate.aplRules) });
measured.sort((a, b) => b.result.dps - a.result.dps);
const baseline = measured.find((entry) => entry.candidate.id === "baseline");
const measuredBest = measured[0];
const significance = meaningfulDpsGain(baseline.result.dps, baseline.result.dpsError, measuredBest.result.dps, measuredBest.result.dpsError);
const winner = measuredBest.candidate.id !== "baseline" && significance.meaningful ? measuredBest : baseline;
const verified = await simulate("single-target", 1, winner.candidate.rules, winner.candidate.aplRules);
const verification = verificationTolerance(winner.result.dps, winner.result.dpsError, verified.dps, verified.dpsError);
assert.equal(verification.stable, true, JSON.stringify(verification));
assert(winner.result.dps >= baseline.result.dps, "optimizer selected a result below baseline");

const bad = await simulate("single-target", 1, [preset.defaultRules.at(-1)], [{ id: `bad-${preset.defaultRules.at(-1)}`, abilityId: preset.defaultRules.at(-1), conditions: [], source: "custom" }]);
assert(bad.dps < baseline.result.dps, "deliberately bad priority was not worse than baseline");
const cleave2 = await simulate("aoe", 2, preset.defaultRules, preset.defaultAplRules);
const aoe3 = await simulate("aoe", 3, preset.defaultRules, preset.defaultAplRules);
const aoe8 = await simulate("aoe", 8, preset.defaultRules, preset.defaultAplRules);
const execute = await simulate("execute", 1, preset.defaultRules, preset.defaultAplRules);
assert(aoe3.dps >= cleave2.dps && aoe8.dps >= aoe3.dps, "AoE target scaling is not monotonic");

const apiInput = { spec: "fury-warrior", scenario: "single-target", fightLengthSeconds: 30, targets: 1, rules: winner.candidate.rules, aplRules: winner.candidate.aplRules, dataMode: "fixture" };
const cachedResponse = await fetch(`${appURL}/api/platform/rotation/simulations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(apiInput) });
const cachedPayload = await cachedResponse.json();
const freshResponse = await fetch(`${appURL}/api/platform/rotation/simulations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...apiInput, verificationRun: true }) });
const freshPayload = await freshResponse.json();
assert.equal(cachedResponse.status, 201, JSON.stringify(cachedPayload));
assert.equal(freshResponse.status, 201, JSON.stringify(freshPayload));
assert.equal(freshResponse.headers.get("x-gildra-verification"), "fresh", "verification request did not bypass the app cache");
assert.equal(cachedPayload.dps, freshPayload.dps, "fresh app verification changed deterministic DPS");

console.log(JSON.stringify({ status: "passed", engine: verified.engine, search: { considered: search.considered, tested: search.candidates.length, limit: search.limit, dimensions: search.dimensions }, baseline: baseline.result.dps, measuredBest: measuredBest.result.dps, meaningfulGain: significance, winner: winner.result.dps, verified: verified.dps, verificationDelta: verification.absoluteDelta, appCacheBypass: freshResponse.headers.get("x-gildra-verification"), bad: bad.dps, scenarios: { singleTarget: baseline.result.dps, cleave2: cleave2.dps, aoe3: aoe3.dps, aoe8: aoe8.dps, execute: execute.dps } }, null, 2));
