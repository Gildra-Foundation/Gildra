import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { createAuctionGearDiagnostics, logAuctionGearDiagnostics } from '../../../lib/wow/auctionGearDiagnostics.ts';

async function harness(evaluate) {
  const source = await readFile(new URL('../../../lib/wow/auctionGearRunner.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export async function assembleAuctionGearSearch(');
  const end = source.indexOf('\nexport async function ', start + 1);
  const body = source.slice(start, end);
  const entry = { id: 'assembly-publication', latestSearchResult: { kind: 'search' }, retainedBaseline: {},
    allowedKey: 'same', context: { options: [{}], input: {}, currentBySlot: new Map() } };
  let now = 0, flushes = 0;
  const run = vm.runInNewContext(stripTypeScriptTypes(body).replace('export ', '') + ';assembleAuctionGearSearch', {
    Date: { now: () => now }, logAuctionGearDiagnostics, metricsFor: () => createAuctionGearDiagnostics(),
    selectedAuctionGearAssemblyOptions: current => current.context.options,
    publicAuctionResult: (_context, result) => result,
    discoverAuctionOptions: async () => {}, auctionFactsKey: () => 'same',
    retainAuctionSimulations: current => current.retainedSimulationCache,
    assembleAuctionGear: evaluate,
    updateAuctionSearchResult: async () => entry.latestSearchResult,
    scheduleAuctionGearSearchSave: () => {}, flushAuctionGearSearch: async () => { flushes++; },
    parseAuctionGearCompareScenarios: () => [],
  });
  return { entry, run, advance: ms => { now += ms; }, flushes: () => flushes };
}
const resultFor = (n, complete = false) => ({ kind: 'assembly', searchId: 'assembly-publication', purchases: [],
  bestConfirmed: null, exhaustiveComplete: complete, bestDps: 100 + n });

test('assembly publishes the first evaluated set while a later evaluation remains pending, retaining cursor and cache', async () => {
  let calls = 0, release, startedResolve;
  const held = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { startedResolve = resolve; });
  const checkpoints = [], publications = [];
  const h = await harness(async input => {
    const n = ++calls;
    assert.equal(input.maxNewSimulations, 1);
    if (n === 2) {
      assert.equal(input.checkpoint, checkpoints[0]);
      assert.equal(input.simulationCache, checkpoints[0].simulationCache);
      startedResolve(); await held;
    }
    const checkpoint = { simulationCache: { [`set-${n}`]: n }, cursor: [n] };
    checkpoints.push(checkpoint);
    return { result: resultFor(n, n === 2), checkpoint };
  });
  const pending = h.run(h.entry, undefined, new AbortController().signal, () => {}, 'token', result => publications.push(result));
  await started;
  assert.equal(h.entry.busy, true);
  assert.equal(publications.at(-1).bestDps, 101, 'current best is visible before the blocked next native call');
  assert.equal(h.entry.latestAssemblyResult, publications.at(-1));
  assert.equal(h.flushes(), 1, 'publication follows durable checkpoint flush');
  release();
  const final = await pending;
  assert.equal(final.bestDps, 102);
  assert.equal(calls, 2);
  assert.equal(h.entry.busy, false);
});

test('assembly caps one turn at eight single-evaluation slices and resumes the saved cursor', async () => {
  let calls = 0;
  const h = await harness(async input => {
    assert.equal(input.maxNewSimulations, 1);
    assert.equal(input.checkpoint?.cursor ?? 0, calls);
    const n = ++calls;
    return { result: resultFor(n, n === 9), checkpoint: { cursor: n, simulationCache: {} } };
  });
  await h.run(h.entry, undefined, new AbortController().signal, () => {}, 'token', () => {});
  assert.equal(calls, 8);
  await h.run(h.entry, undefined, new AbortController().signal, () => {}, 'token', () => {});
  assert.equal(calls, 9, 'continuation resumes rather than starting the enumeration again');
});

test('cancellation after partial assembly fences later evaluation result and releases busy state', async () => {
  const controller = new AbortController(), publications = [];
  let calls = 0;
  const h = await harness(async () => {
    const n = ++calls;
    if (n === 2) controller.abort();
    return { result: resultFor(n), checkpoint: { cursor: n, simulationCache: {} } };
  });
  await assert.rejects(h.run(h.entry, undefined, controller.signal, () => {}, 'token', result => publications.push(result)), { name: 'AbortError' });
  assert.equal(publications.at(-1).bestDps, 101);
  assert.equal(h.entry.assemblyCheckpoint.cursor, 1);
  assert.equal(h.entry.busy, false);
});
