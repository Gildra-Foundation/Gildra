import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { assembleAuctionGear, auctionPlanCost, auctionPlanLoadout, planAuctionGear, searchAuctionGearOptions } from "../../../lib/wow/auctionGearPlanner.ts";
import { candidate, growingMarketRunner, input, option, simulation, slots } from "./optimizer-fixtures.mjs";

// Desired behavior tests, not assertions that preserve the reported defects.
// Each case runs independently so a RED baseline records every regression.
export const cases = [
  { id: "confirmed-upgrade-survives-noisy-measured-winner", regression: true, async run(record) {
    const options = [option(1, "HEAD", 101, { costCopper: 20 }), option(2, "HEAD", 102, { costCopper: 30 })];
    const fixture = input(options, { simulate: async selections => selections.length
      ? selections[0].auctionId === 1 ? simulation(1100, 1) : simulation(1200, 200) : simulation(1000, 10) });
    const searched = await searchAuctionGearOptions(fixture);
    const assembled = await assembleAuctionGear({ ...fixture, baseline: searched.result.baseline,
      simulationCache: searched.checkpoint.simulationCache });
    const result = assembled.result;
    record({ result, individualEvaluations: searched.result.items.map(value => ({ auctionId: value.auctionId, evaluation: value.evaluation })) });
    assert.equal(result.comparison.candidateDps, 1200, "preserve the honest measured maximum");
    assert.equal(result.comparison.uncertainty.significant, false);
    assert.equal(result.exhaustiveComplete, true);
    assert(result.bestConfirmed, "an affordable confirmed upgrade must remain independently actionable");
    assert.equal(result.bestConfirmed.comparison.candidateDps, 1100);
    assert.equal(result.bestConfirmed.comparison.uncertainty.significant, true);
    assert.equal(result.bestConfirmed.spentCopper, 20);
    assert.deepEqual(result.bestConfirmed.purchases.map(value => value.auctionId), [1]);
    const resumed = await assembleAuctionGear({ ...fixture, checkpoint: JSON.parse(JSON.stringify(assembled.checkpoint)) });
    assert.deepEqual(resumed.result.bestConfirmed, result.bestConfirmed, "confirmed choice survives serialized continuation");
  } },
  { id: "legacy-plan-returns-known-confirmed-upgrade", regression: true, async run(record) {
    const fixture = input([option(1, "HEAD", 101, { costCopper: 20 }), option(2, "HEAD", 102, { costCopper: 30 })], {
      simulate: async selections => selections.length ? selections[0].auctionId === 1 ? simulation(1100, 1)
        : simulation(1200, 200) : simulation(1000, 10) });
    const result = await planAuctionGear(fixture); record(result);
    assert.equal(result.comparison.candidateDps, 1100);
    assert.deepEqual(result.purchases.map(value => value.auctionId), [1]);
  } },
  { id: "useful-sixteen-slot-seed-within-first-forty-eight", regression: true, async run(record) {
    const options = slots.flatMap((slot, index) => Array.from({ length: 3 }, (_, effect) => option(1000 + index * 3 + effect, slot)));
    let calls = 0;
    const fixture = input(options, { maxNewSimulations: 100,
      simulate: async selections => { calls++; return simulation(1000 + selections.reduce((total, value) => total + 10 - (value.candidate.itemId - 1000) % 3, 0)); } });
    const searched = await searchAuctionGearOptions(fixture); assert.equal(searched.result.searchComplete, true);
    const startCalls = calls;
    const assembled = await assembleAuctionGear({ ...fixture, maxNewSimulations: 48,
      baseline: searched.result.baseline, simulationCache: searched.checkpoint.simulationCache });
    record({ result: assembled.result, newMockSimulations: calls - startCalls });
    assert(calls - startCalls <= 48, "complete-set seeds respect the existing per-step simulation limit");
    assert.equal(assembled.result.exhaustiveComplete, false, "heuristic seeds never claim completion of 4^16 states");
    assert.equal(assembled.result.combinationCount, "4294967296");
    assert.equal(assembled.result.comparison.candidateDps, 1160, "try the readily feasible complete set before spending the step only on pairs");
    assert.equal(assembled.result.purchases.length, 16);
    assert.equal(assembled.result.spentCopper, 16);
  } },
  { id: "actual-runner-retains-affordable-compound-on-returning-offers", regression: true, async run(record) {
    const fixture = await growingMarketRunner(), before = await fixture.assemble();
    assert.equal(before.comparison.candidateDps, 1500); assert.equal(before.exhaustiveComplete, true);
    fixture.grow(); await fixture.refresh();
    const oldIds = before.purchases.map(value => `${value.auctionId}:${value.slotType}:${value.variantKey}`);
    assert(oldIds.every(id => fixture.entry.context.options.some(value => value.id === id)));
    assert.equal(fixture.entry.context.options.length, 16);
    const startCalls = fixture.calls, after = await fixture.assemble();
    record({ before, after, returnedOfferEffects: 13, newMockSimulations: fixture.calls - startCalls,
      originalPurchaseOptionsRemainAvailable: true });
    assert(fixture.calls - startCalls <= 48);
    assert.equal(after.exhaustiveComplete, false);
    assert.equal(after.comparison.candidateDps, 1500, "pool growth must not erase a still feasible cached compound incumbent");
    assert.equal(after.purchases.length, 3);
    assert.equal(after.spentCopper, 3);
  } },
  { id: "exact-raw-lot-oracle-quantity-cost-and-unique-compatibility", regression: false, async run(record) {
    const ringSlots = ["FINGER_1", "FINGER_2"];
    const options = ringSlots.flatMap(slot => [option(301, slot, 300, { costCopper: 20 }),
      option(302, slot, 300, { costCopper: 30, quantity: 2 }),
      option(303 + ringSlots.indexOf(slot), slot, 400 + ringSlots.indexOf(slot), { costCopper: 12,
        candidate: candidate(slot, 400 + ringSlots.indexOf(slot), { limitCategoryId: 9, limitQuantity: 1 }) })]);
    const measure = selections => 1000 + selections.reduce((sum, value) => sum + (value.candidate.itemId === 300 ? 20 : 50), 0)
      + (selections.length === 2 && selections.every(value => value.candidate.itemId === 300) ? 80 : 0);
    // Independent enumeration of real offer assignments, without effect groups/DP.
    let oracle = { dps: 1000, cost: 0 };
    for (const first of [null, ...options.filter(value => value.candidate.slotType === ringSlots[0])])
      for (const second of [null, ...options.filter(value => value.candidate.slotType === ringSlots[1])]) {
        const selection = [first, second].filter(Boolean), counts = new Map(), lots = new Map();
        let invalid = false;
        for (const value of selection) {
          const count = (counts.get(value.auctionId) ?? 0) + 1; counts.set(value.auctionId, count);
          if (count > value.quantity) invalid = true;
          lots.set(value.auctionId, value.costCopper);
        }
        if (selection.filter(value => value.candidate.constraints.limitCategoryId === 9).length > 1) invalid = true;
        const cost = [...lots.values()].reduce((sum, value) => sum + value, 0), dps = measure(selection);
        if (!invalid && cost <= 30 && (dps > oracle.dps || dps === oracle.dps && cost < oracle.cost)) oracle = { dps, cost };
      }
    const result = (await assembleAuctionGear(input(options, { budgetCopper: 30, maxNewSimulations: 1000,
      simulate: async selections => simulation(measure(selections)) }))).result;
    record({ oracle, result });
    assert.equal(result.exhaustiveComplete, true); assert.equal(result.comparison.candidateDps, oracle.dps);
    assert.equal(result.spentCopper, oracle.cost); assert.equal(result.spentCopper, 30);
    assert(result.purchases.every(value => value.auctionId === 302));
    assert.equal(result.purchases.length, 2, "a quantity-two lot is bought once and equips both slots");
    const excluded = options.filter(value => !(value.auctionId === 302 && value.candidate.slotType === "FINGER_2"));
    const excludedResult = (await assembleAuctionGear(input(excluded, { budgetCopper: 30, maxNewSimulations: 1000,
      simulate: async selections => simulation(measure(selections)) }))).result;
    assert.equal(excludedResult.comparison.candidateDps, 1050, "an excluded slot alias cannot be restored by allocation");
  } },
  { id: "checkpoint-pause-cancel-resume-keeps-exact-nonlinear-result", regression: false, async run(record) {
    const options = ["HEAD", "CHEST", "WRIST", "FEET"].map((slot, index) => option(500 + index, slot));
    const fixture = input(options, { simulate: async selections => simulation(selections.length === 4 ? 1500 : selections.length ? 990 : 1000) });
    const baseline = simulation(1000), paused = await assembleAuctionGear({ ...fixture, baseline, shouldYield: () => true });
    assert.equal(paused.result.exhaustiveComplete, false); assert.equal(paused.result.simulations, 0);
    const controller = new AbortController(); let saved, calls = 0;
    await assert.rejects(assembleAuctionGear({ ...fixture, baseline, signal: controller.signal,
      onCheckpoint: state => { saved = structuredClone(state); }, simulate: async selections => {
        if (++calls === 3) { controller.abort(new Error("synthetic_cancel")); controller.signal.throwIfAborted(); }
        return fixture.simulate(selections);
      } }), /synthetic_cancel/);
    assert(saved, "successful work was checkpointed before cancellation");
    let checkpoint = JSON.parse(JSON.stringify(saved)), result;
    for (let step = 0; step < 50; step++) {
      const resumed = await assembleAuctionGear({ ...fixture, maxNewSimulations: 1, checkpoint });
      checkpoint = JSON.parse(JSON.stringify(resumed.checkpoint)); result = resumed.result;
      if (result.exhaustiveComplete) break;
    }
    record({ cancelledAfterMockCalls: calls, result });
    assert.equal(result.exhaustiveComplete, true); assert.equal(result.comparison.candidateDps, 1500);
    assert.equal(result.purchases.length, 4); assert.equal(result.combinationCount, "16");
    const selected = result.purchases.map(purchase => options.find(value => value.auctionId === purchase.auctionId));
    assert.equal(auctionPlanCost(selected), result.spentCopper); auctionPlanLoadout([], selected, 72, fixture.selectedSlots);
    await assert.rejects(assembleAuctionGear({ ...fixture, budgetCopper: 99, checkpoint }), /auction_search_changed/);
  } },
];

export async function runOptimizerReliability() {
  const startedAt = new Date().toISOString(), results = [];
  const sourceFiles = {};
  for (const path of ["auctionGearPlanner.ts", "auctionGearEffects.ts", "auctionGearRunner.ts", "auctionGearTypes.ts"])
    sourceFiles[`apps/web/lib/wow/${path}`] = createHash("sha256").update(readFileSync(new URL(`../../../lib/wow/${path}`, import.meta.url))).digest("hex");
  for (const test of cases) {
    const start = performance.now(); let observed;
    try { await test.run(value => { observed = value; });
      results.push({ id: test.id, regression: test.regression, status: "passed", durationMs: Math.round(performance.now() - start), observed });
    } catch (error) {
      results.push({ id: test.id, regression: test.regression, status: "failed", durationMs: Math.round(performance.now() - start),
        observed, error: { name: error.name, message: error.message, expected: error.expected, actual: error.actual, stack: error.stack } });
    }
  }
  return { status: results.some(value => value.status === "failed") ? "failed" : "passed", startedAt, completedAt: new Date().toISOString(),
    mode: "Synthetic offline actual-module regressions; mocked external market/armory/native transports only; no service requests.",
    sourceRevision: process.env.RELIABILITY_SOURCE_REVISION ?? null, sourceFiles,
    totals: { cases: results.length, passed: results.filter(value => value.status === "passed").length,
      failed: results.filter(value => value.status === "failed").length }, cases: results };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runOptimizerReliability(), output = process.argv[process.argv.indexOf("--report") + 1];
  if (process.argv.includes("--report")) { assert(output, "--report requires a path"); mkdirSync(dirname(resolve(output)), { recursive: true });
    writeFileSync(output, JSON.stringify(report, null, 2) + "\n"); }
  for (const test of report.cases) console.log(`${test.status === "passed" ? "PASS" : "FAIL"} ${test.id}${test.error ? `: ${test.error.message.split("\n")[0]}` : ""}`);
  console.log(JSON.stringify(report.totals)); if (report.status !== "passed") process.exitCode = 1;
}
