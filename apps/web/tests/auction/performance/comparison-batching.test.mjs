/** Actual Runner/Planner/Persistence; synthetic lots/native measurements; no HTTP or native processes. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { searchAuctionGearOptions } from '../../../lib/wow/auctionGearPlanner.ts';
import { createAuctionGearDiagnostics } from '../../../lib/wow/auctionGearDiagnostics.ts';
import { readAuctionState, writeAuctionState, writeAuctionStateAsync } from '../../../lib/wow/auctionGearPersistence.ts';

const runnerPath = new URL('../../../lib/wow/auctionGearRunner.ts', import.meta.url);
const current = await readFile(runnerPath, 'utf8');
const baselineCommit = '37f3cfbea1ea7374b9d0b8efef11e8b8cdb76e86';
const formerContinue = await readFile(new URL('./fixtures/continue-search-before-batching.ts.txt', import.meta.url), 'utf8');
// Freeze only the changed orchestration; both versions run the same actual current
// Planner/update/public-result functions. No git history is needed in CI.
const continueStart = current.indexOf('export async function continueAuctionGearSearch(');
const continueEnd = current.indexOf('/** Refresh actual character', continueStart);
const baseline = current.slice(0, continueStart) + formerContinue + current.slice(continueEnd);
const hash = source => createHash('sha256').update(source).digest('hex');
const part = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const executable = source => stripTypeScriptTypes([
  part(source, 'function publicAuctionResult(', 'function retainAuctionIncumbents('),
  part(source, 'async function updateAuctionSearchResult(', 'export async function startAuctionGearSearch('),
  part(source, 'function setAuctionGearPhase(', 'export async function continueAuctionGearSearch('),
  part(source, 'export async function continueAuctionGearSearch(', '/** Refresh actual character'),
].join('\n')).replace(/^export /gm, '') + '\n;({continueAuctionGearSearch,updateAuctionSearchResult})';
const measurement = dps => ({ dps, dpsError: 1, confidence: 95, iterations: 1000, engine: 'SimulationCraft synthetic-batching' });
function options(effects = 9, lots = 100) {
  return Array.from({ length: effects * lots }, (_, index) => {
    const effect = index % effects, itemId = 900000 + effect;
    return { id: `synthetic-lot-${String(index).padStart(5, '0')}`, auctionId: 800000 + index, quantity: 1,
      costCopper: 100 + index, variantKey: 'synthetic-exact', candidate: {
        entityId: `synthetic-${itemId}`, itemId, name: `Synthetic ${effect}`, slotType: 'WRIST', itemLevel: 300,
        inventoryType: 9, itemClassId: 4, itemSubclassId: 4, eligible: true, rejectionReasons: [],
        constraints: { uniqueEquipped: false, crafted: false, allowableClassMask: '0', requiredLevel: 1 },
        compatibility: { specId: 72, method: 'specialization', itemClassId: 4, itemSubclassId: 4 },
        variants: [{ key: 'synthetic-exact', itemLevel: 300, contextId: 0, bonusIds: [effect + 1] }],
      } };
  });
}
async function withDirectory(work) {
  assert.equal(process.env.GILDRA_AUCTION_STATE_DIR, undefined, 'Never use a service checkpoint directory');
  const directory = await mkdtemp(join(tmpdir(), 'gildra-batching-test-'));
  process.env.GILDRA_AUCTION_STATE_DIR = directory;
  try { return await work(); }
  finally { delete process.env.GILDRA_AUCTION_STATE_DIR; await rm(directory, { recursive: true, force: true }); }
}
function harness(source, { effects = 9, lots = 100, beforeSimulation, retainedBaseline = true } = {}) {
  const metrics = createAuctionGearDiagnostics(), publications = [], durable = [];
  const stats = { plannerCalls: 0, plannerMs: 0, flushes: 0, durableMs: 0, schedules: 0, nativeCalls: 0, nativeItems: [], plannerLimits: [] };
  const entry = { id: randomUUID(), owner: 'synthetic-batching-owner', retainedBaseline: retainedBaseline ? measurement(1000) : undefined,
    context: { input: { scenario: 'single-target', objective: 'value', budgetCopper: 100000, selectedSlots: ['WRIST'] },
      options: options(effects, lots), loadout: [], specId: 72, market: { sourceUpdatedAt: new Date().toISOString() },
      coverage: { discoveryComplete: true, dataComplete: true }, currentBySlot: new Map(), publicMarket: { realm: 'SYNTHETIC' },
      simulate: async (selected, signal) => {
        signal.throwIfAborted(); stats.nativeCalls++; stats.nativeItems.push(selected[0]?.candidate.itemId ?? 'baseline');
        await beforeSimulation?.(selected, signal, stats.nativeCalls);
        signal.throwIfAborted(); return measurement(1000 + (selected.length ? selected[0].candidate.itemId - 899999 : 0));
      } } };
  writeAuctionState('search', entry.id, Date.now() + 60_000, {}, { metadata: { owner: entry.owner } });
  entry.context.simulate.concurrency = async () => 2;
  const writeCheckpoint = async state => {
    stats.flushes++; const start = performance.now();
    const snapshot = { checkpoint: state.searchCheckpoint, result: state.latestSearchResult };
    await writeAuctionStateAsync('search', state.id, Date.now() + 60_000, snapshot, { metadata: { owner: state.owner } });
    stats.durableMs += performance.now() - start;
    durable.push(snapshot);
  };
  const runner = vm.runInNewContext(executable(source), { Date, Map, Set, Object, Number, JSON,
    comparedOptions: new WeakMap(), metricsFor: () => metrics, logAuctionGearDiagnostics: () => {},
    discoverAuctionOptions: async () => {},
    searchAuctionGearOptions: async input => {
      stats.plannerCalls++; stats.plannerLimits.push(input.maxNewSimulations); const start = performance.now();
      try { return await searchAuctionGearOptions(input); } finally { stats.plannerMs += performance.now() - start; }
    },
    scheduleAuctionGearSearchSave: () => { stats.schedules++; },
    flushAuctionGearSearch: writeCheckpoint, flushPendingAuctionGearSearch: writeCheckpoint,
  });
  const publish = result => {
    // Publication must follow an awaited durable commit of the same comparison set.
    const saved = durable.at(-1)?.result;
    if (!publications.length && entry.latestSearchResult && !durable.length) {
      publications.push(result); return;
    }
    assert.equal(result.items, saved.items);
    publications.push(result);
  };
  return { entry, runner, stats, publications, durable, publish,
    reset: () => { for (const key of ['plannerCalls', 'plannerMs', 'flushes', 'durableMs', 'schedules', 'nativeCalls']) stats[key] = 0;
      stats.nativeItems = []; stats.plannerLimits = []; publications.length = 0; durable.length = 0; } };
}
const canonicalItems = result => JSON.parse(JSON.stringify(result.items));

test('continuation batches eight native effects with identical complete results and fewer planner passes/durable publications', async () => withDirectory(async () => {
  const measurements = [];
  for (let repeat = 0; repeat < 3; repeat++) for (const [version, source] of [['baseline', baseline], ['batched', current]]) {
    const h = harness(source);
    await h.runner.updateAuctionSearchResult(h.entry, new AbortController().signal, () => {}, () => false, 1);
    h.reset(); const began = performance.now();
    const result = await h.runner.continueAuctionGearSearch(h.entry, new AbortController().signal, () => {}, 'synthetic', h.publish);
    const elapsedMs = performance.now() - began;
    assert.deepEqual(readAuctionState('search', h.entry.id)?.data.checkpoint, h.durable.at(-1).checkpoint);
    assert.equal(result.pendingItems, 0); assert.equal(result.searchComplete, true); assert.equal(result.items.length, 900);
    assert.equal(result.items.filter(item => item.comparison).length, 900); assert.equal(h.stats.nativeCalls, 8);
    assert.equal(h.entry.busy, false); assert.equal(h.durable.at(-1).checkpoint.nextOption, 900, 'final flush retains the complete traversal');
    assert.deepEqual(h.stats.nativeItems, [900001, 900002, 900003, 900004, 900005, 900006, 900007, 900008]);
    if (version === 'batched') { assert.equal(h.stats.plannerCalls, 1); assert.equal(h.stats.flushes, 2); assert.equal(h.publications.length, 2); }
    measurements.push({ version, repeat, elapsedMs, ...structuredClone(h.stats), publications: h.publications.length, items: canonicalItems(result) });
  }
  const expected = measurements[0].items;
  for (const row of measurements) assert.deepEqual(row.items, expected, 'batching must preserve every complete comparison and evaluation');
  const summary = ['baseline', 'batched'].map(version => {
    const rows = measurements.filter(row => row.version === version), median = field => [...rows.map(row => row[field])].sort((a,b)=>a-b)[1];
    return { version, plannerCalls: rows[0].plannerCalls, durableFlushes: rows[0].flushes, publications: rows[0].publications,
      nativeComparisons: rows[0].nativeCalls, rows: 900, medianMs: median('elapsedMs'), medianPlannerMs: median('plannerMs'), medianDurableMs: median('durableMs') };
  });
  assert(summary[1].plannerCalls < summary[0].plannerCalls); assert(summary[1].durableFlushes < summary[0].durableFlushes);
  console.log(JSON.stringify({ scope: 'Former/current actual Runner orchestration, actual Planner and async durable checkpoint writer. 900 synthetic lots/9 native effects; native results are local fixture values. Not a live/native throughput claim.', baselineCommit, formerContinueHash: hash(formerContinue), baselineHash: hash(baseline), currentHash: hash(current), summary,
    runs: measurements.map(({items,...row})=>row) }, null, 2));
}));

test('initial useful comparison is durably published before the next slower native comparison settles', async () => withDirectory(async () => {
  let release, secondStarted;
  const held = new Promise(resolve => { release = resolve; }), entered = new Promise(resolve => { secondStarted = resolve; });
  const h = harness(current, { effects: 5, lots: 1, retainedBaseline: false, beforeSimulation: async selected => {
    if (selected[0]?.candidate.itemId === 900001) { secondStarted(); await held; }
  } });
  const pending = h.runner.continueAuctionGearSearch(h.entry, new AbortController().signal, () => {}, 'synthetic', h.publish);
  await Promise.race([entered, pending.then(() => assert.fail('search finished before held comparison'))]);
  try {
    const useful = h.publications.find(result => result.items.some(item => item.comparison));
    assert(useful, 'first comparison must already be published while the next native call is held');
    assert.equal(useful.items.filter(item => item.comparison).length, 1);
    assert.equal(readAuctionState('search', h.entry.id)?.data.result.items.filter(item => item.comparison).length, 1);
    assert.equal(h.stats.nativeCalls, 3, 'initial budget includes baseline and two comparisons; the third call is held');
  } finally { release(); await pending; }
  const result = await pending;
  assert.equal(result.items.filter(item => item.comparison).length, 2); assert.equal(result.pendingItems, 3);
  assert.equal(h.stats.nativeCalls, 3); assert.equal(h.entry.busy, false);
}));

test('cancellation inside a batch keeps completed checkpoints and final durable flush; resume finishes without repeated native work', async () => withDirectory(async () => {
  const controller = new AbortController();
  const h = harness(current, { effects: 9, lots: 1, beforeSimulation: async (_selected, _signal, count) => {
    if (count === 4) { await new Promise(resolve => setImmediate(resolve)); controller.abort(); }
  } });
  await h.runner.updateAuctionSearchResult(h.entry, controller.signal, () => {}, () => false, 1);
  h.reset();
  await assert.rejects(h.runner.continueAuctionGearSearch(h.entry, controller.signal, () => {}, 'synthetic', h.publish), /abort/i);
  assert.equal(h.entry.busy, false); assert.equal(h.stats.flushes, 1, 'finally must flush even when the batch throws before publication');
  const saved = readAuctionState('search', h.entry.id)?.data.checkpoint;
  assert.equal(Object.keys(saved.simulationCache).length, 5, 'baseline, seed and three completed comparisons survive cancellation, including a prefetched sibling');
  assert(saved.nextOption >= 3 && saved.nextOption <= 4, 'cursor cannot skip an unfinished comparison');
  const completedBefore = new Set(h.stats.nativeItems.slice(0, 3));
  h.entry.searchCheckpoint = structuredClone(saved); h.reset();
  await h.runner.continueAuctionGearSearch(h.entry, new AbortController().signal, () => {}, 'synthetic', h.publish);
  assert.equal(h.entry.latestSearchResult.searchComplete, true); assert.equal(h.entry.latestSearchResult.pendingItems, 0);
  assert(h.stats.nativeItems.every(id => !completedBefore.has(id)), 'resume cannot repeat durable completed native effects');
  assert.equal(h.durable.at(-1).checkpoint.nextOption, 9);
}));
