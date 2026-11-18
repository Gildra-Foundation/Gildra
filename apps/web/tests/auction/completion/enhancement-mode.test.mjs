import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { parseAuctionGearEnhancementMode, auctionGearAssemblyGoalComplete } from '../../../lib/wow/auctionGearEnhancementMode.ts';
import { advanceAuctionGearRunPolicy, createAuctionGearRunPolicy } from '../../../lib/wow/auctionGearRunPolicy.ts';
import { auctionGearResultMatchesIntent } from '../../../lib/wow/auctionGearResult.ts';
import { createAuctionGearDiagnostics, logAuctionGearDiagnostics } from '../../../lib/wow/auctionGearDiagnostics.ts';

test('mode validation and result identity preserve legacy enhanced semantics', () => {
  assert.equal(parseAuctionGearEnhancementMode(undefined), 'enhanced');
  for (const mode of ['equipment', 'enhanced']) assert.equal(parseAuctionGearEnhancementMode(mode), mode);
  for (const value of [null, '', 'quick', 'full', {}, [], true, 1]) assert.throws(() => parseAuctionGearEnhancementMode(value), /invalid_plan_request/);
  const intent = { budgetGold: '100', objective: 'dps', selectedSlots: ['HEAD'], scenario: 'single-target' };
  const result = { ...intent, budgetCopper: 1000000 };
  assert.equal(auctionGearResultMatchesIntent(intent, result), true);
  assert.equal(auctionGearResultMatchesIntent({ ...intent, enhancementMode: 'enhanced' }, result), true);
  assert.equal(auctionGearResultMatchesIntent({ ...intent, enhancementMode: 'equipment' }, result), false);
  assert.equal(auctionGearResultMatchesIntent(intent, { ...result, enhancementMode: 'equipment' }), false);
  assert.equal(auctionGearResultMatchesIntent({ ...intent, enhancementMode: 'equipment' }, { ...result, enhancementMode: 'equipment' }), true);
});

test('full equipment ignores irrelevant enhancements but waits for traversal and requested scenarios', () => {
  const result = { kind: 'assembly', enhancementMode: 'equipment', exhaustiveComplete: true,
    scenarioComparisonsComplete: true, enhancementOptimization: { complete: false } };
  assert.equal(auctionGearAssemblyGoalComplete(result), true);
  const step = value => advanceAuctionGearRunPolicy(createAuctionGearRunPolicy('full', 'assembly'), value, { jobId: 'fixture-job', canAssemble: true });
  assert.equal(step(result).next, null);
  assert.equal(step({ ...result, exhaustiveComplete: false }).next, 'assembly');
  assert.equal(step({ ...result, scenarioComparisonsComplete: false }).next, 'assembly');
});

test('explicit enhanced waits for an actual terminal stage; unavailable is honest terminal, absent legacy is unchanged', () => {
  const result = { kind: 'assembly', exhaustiveComplete: true };
  const step = value => advanceAuctionGearRunPolicy(createAuctionGearRunPolicy('full', 'assembly'), value, { jobId: 'fixture-job', canAssemble: true });
  assert.equal(step(result).next, null);
  assert.equal(step({ ...result, enhancementMode: 'enhanced' }).next, 'assembly');
  assert.equal(step({ ...result, enhancementMode: 'enhanced', enhancementOptimization: { complete: false, status: 'pending' } }).next, 'assembly');
  for (const status of ['ready', 'unavailable', 'no_affordable_configuration']) {
    assert.equal(step({ ...result, enhancementMode: 'enhanced', enhancementOptimization: { complete: true, status } }).next, null);
  }
});

async function runner(mode, { verified = true, stageComplete = true, aborted = false, failSave = false, scenarios = false } = {}) {
  const source = await readFile(new URL('../../../lib/wow/auctionGearRunner.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export async function assembleAuctionGearSearch(');
  const end = source.indexOf('\nexport async function ', start + 1);
  const phase = source.slice(source.indexOf('function setAuctionGearPhase('), source.indexOf('export async function continueAuctionGearSearch('));
  const input = { ...(mode !== undefined ? { enhancementMode: mode } : {}), compareScenarios: scenarios ? [{}] : [] };
  const option = { id: 'fixture-option', variantKey: 'fixture-variant', candidate: { variants: [{ key: 'fixture-variant',
    resolution: { ...(verified ? { enhancements: { status: 'verified' } } : {}) } }] } };
  const entry = { id: 'fixture-search', context: { input, options: [option], currentBySlot: new Map(), armory: { equipment: {} }, character: {} },
    latestSearchResult: { kind: 'search', items: [] }, retainedBaseline: {}, allowedKey: 'same' };
  const calls = { equipment: [], enhancement: [], socketProposals: 0, scenarios: 0, saved: 0 }, publications = [];
  const controller = new AbortController(); if (aborted) controller.abort();
  const checkpoint = { best: { optionIds: ['fixture-option'] }, bestConfirmed: null, baseline: { engine: 'fixture', iterations: 750, confidence: 95 }, simulationCache: {} };
  const flush = async () => { calls.saved++; if (failSave && entry.latestAssemblyResult?.enhancementOptimization) throw Error('auction_storage_unavailable'); };
  const run = vm.runInNewContext(stripTypeScriptTypes(phase + source.slice(start, end)).replace('export ', '') + ';assembleAuctionGearSearch', {
    Date, Map, Set, logAuctionGearDiagnostics, metricsFor: () => createAuctionGearDiagnostics(),
    selectedAuctionGearAssemblyOptions: () => [option], auctionFactsKey: () => 'same',
    publicAuctionResult: (_context, value) => ({ ...value, ...input }),
    discoverAuctionOptions: async () => {}, retainAuctionSimulations: () => ({}),
    assembleAuctionGear: async request => { calls.equipment.push(request); return { checkpoint, result: { kind: 'assembly', exhaustiveComplete: true, purchases: [], bestConfirmed: null } }; },
    updateAuctionSearchResult: async () => entry.latestSearchResult,
    scheduleAuctionGearSearchSave: () => {}, flushAuctionGearSearch: flush, flushPendingAuctionGearSearch: flush,
    parseAuctionGearCompareScenarios: () => input.compareScenarios,
    additionalAuctionSocketFinalists: () => { calls.socketProposals++; return { finalists: [], reasons: [] }; },
    evaluateAuctionEnhancementStage: async request => { calls.enhancement.push(request); return { complete: stageComplete, status: stageComplete ? 'ready' : 'pending', recommendations: [], searchLimited: true }; },
    auctionEnhancementCatalogInfo: { revision: 'fixture-catalog' },
    evaluateAuctionGearScenarios: async () => { calls.scenarios++; return []; }, withFreshEnhancementQuotes: value => value,
  });
  return { entry, calls, publications, execute: () => run(entry, undefined, controller.signal, () => {}, 'fixture-token', value => publications.push(value)) };
}

test('actual Runner equipment mode skips all enhancement calls/state and keeps native equipment parameters', async () => {
  const h = await runner('equipment', { scenarios: true }); const result = await h.execute();
  assert.equal(h.calls.equipment.length, 1); assert.equal(h.calls.enhancement.length, 0);
  assert.equal(h.calls.socketProposals, 0);
  assert.equal(h.calls.equipment[0].maxNewSimulations, 1); assert.equal(h.calls.equipment[0].baseline, h.entry.retainedBaseline);
  assert.equal(h.entry.enhancementState, undefined); assert.equal(result.enhancementOptimization, undefined);
  assert.equal(h.calls.scenarios, 1); assert.equal(result.scenarioComparisonsComplete, true);
});

test('actual Runner enhanced and legacy modes retain the stage, checkpoints, and pending scenario barrier', async () => {
  for (const mode of ['enhanced', undefined]) {
    const h = await runner(mode, { stageComplete: false, scenarios: true }); const result = await h.execute();
    assert.equal(h.calls.enhancement.length, 1); assert.equal(h.calls.scenarios, 0);
    assert.equal(h.calls.socketProposals, mode === 'enhanced' ? 1 : 0);
    assert.equal(h.calls.enhancement[0].includeObjectiveAlternatives, mode === 'enhanced');
    assert.equal(h.calls.enhancement[0].baseline.iterations, 750); assert.equal(h.calls.enhancement[0].baseline.confidence, 95);
    assert.equal(result.enhancementOptimization.status, 'pending'); assert.equal(result.scenarioComparisonsComplete, false);
    assert.equal(h.calls.enhancement[0].state, h.entry.enhancementState);
    assert.equal(h.publications.at(-1).enhancementOptimization.status, 'pending');
  }
});

test('actual Runner explicit enhanced without exact metadata publishes unavailable and terminates, legacy omission remains unchanged', async () => {
  for (const mode of ['enhanced', undefined, 'equipment']) {
    const h = await runner(mode, { verified: false }); const result = await h.execute();
    assert.equal(h.calls.enhancement.length, 0);
    if (mode === 'enhanced') {
      assert.equal(result.enhancementOptimization.status, 'unavailable'); assert.equal(result.enhancementOptimization.complete, true);
      assert.equal(result.enhancementOptimization.searchLimited, true); assert.equal(auctionGearAssemblyGoalComplete(result), true);
      assert.equal(result.enhancementOptimization.reasons[0], 'variant_enhancements_unknown');
      assert(h.calls.saved >= 2, 'Unavailable terminal outcome passes the durable final checkpoint barrier');
      assert(h.publications.every(value => !value.enhancementOptimization), 'Earlier published equipment snapshots remain immutable');
    } else assert.equal(result.enhancementOptimization, undefined);
  }
});

test('actual Runner abort and failed durable stage publication cannot acknowledge an enhanced result', async () => {
  const aborted = await runner('equipment', { aborted: true }); await assert.rejects(aborted.execute(), { name: 'AbortError' });
  assert.equal(aborted.calls.equipment.length, 0); assert.equal(aborted.calls.enhancement.length, 0);
  const failed = await runner('enhanced', { failSave: true }); await assert.rejects(failed.execute(), /auction_storage_unavailable/);
  assert(failed.publications.every(result => !result.enhancementOptimization)); assert.equal(failed.entry.busy, false);
  const unavailable = await runner('enhanced', { verified: false, failSave: true });
  await assert.rejects(unavailable.execute(), /auction_storage_unavailable/);
  assert(unavailable.publications.every(result => !result.enhancementOptimization));
});
