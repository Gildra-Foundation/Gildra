/** Actual SearchStore/Persistence; synthetic marketplace; private temporary files only. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import v8 from 'node:v8';
import { stripTypeScriptTypes, syncBuiltinESMExports } from 'node:module';
import vm from 'node:vm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from '../../../lib/wow/auctionGearSearchStore.ts';
import { readAuctionState } from '../../../lib/wow/auctionGearPersistence.ts';
import { createAuctionGearDiscovery } from '../../../lib/wow/auctionGearDiscovery.ts';
import { createAuctionGearDiagnostics } from '../../../lib/wow/auctionGearDiagnostics.ts';

function syntheticContext(offerCount = 60_000) {
  const timestamp = new Date().toISOString();
  const offers = Array.from({ length: offerCount }, (_, i) => ({ auctionId: i + 1, itemId: 700000 + i % 6000,
    quantity: 1 + i % 3, buyoutCopper: 10000 + i * 17, contextId: 13, bonusIds: [9000 + i % 376], modifiers: [{ type: 9, value: 90 }] }));
  const market = { id: 'synthetic', region: 'eu', connectedRealmId: 1, sourceUpdatedAt: timestamp, fetchedAt: timestamp, offers };
  return { input: { locale: 'en', characterSlug: 'synthetic', budgetCopper: 10000000, scenario: 'single-target', selectedSlots: ['HEAD'] },
    character: { id: 1, level: 90, playableClass: { id: 1 }, playableRace: { id: 1 }, faction: { type: 'ALLIANCE' } },
    armory: { equipment: { equipped_items: [] }, profile: {}, specializations: {}, activeTalentLoadout: 'synthetic' },
    options: [], loadout: [], specId: 72, specSlug: 'fury-warrior', market: { ...market, offers: [] }, currentBySlot: new Map(),
    discovery: createAuctionGearDiscovery(market, 10000000), discoverySeason: { id: 'synthetic', patch: 'synthetic', expansionId: 11, activityNames: [] },
    encounter: { fightLengthSeconds: 120, targets: 1 }, coverage: {}, searchLimited: true, publicMarket: {},
    profileFingerprint: 'synthetic', scenario: 'single-target', marketChange: {}, simulate: async () => {}, discoveryContext: () => {},
  };
}
const domainState = data => {
  const { createdAt, touchedAt, expiresAt, recency, ...domain } = data;
  void createdAt; void touchedAt; void expiresAt; void recency;
  return domain;
};
test('marked publication barriers retain identical data with one snapshot instead of two whole-market serializations', async () => {
  assert.equal(process.env.GILDRA_AUCTION_STATE_DIR, undefined, 'Never benchmark production checkpoints');
  const directory = await fs.mkdtemp(join(tmpdir(), 'gildra-checkpoint-barrier-'));
  process.env.GILDRA_AUCTION_STATE_DIR = directory;
  let entry;
  const originalSerialize = v8.serialize, originalOpen = fs.open;
  let counts;
  try {
    entry = store.createAuctionGearSearch('synthetic-barrier-owner', syntheticContext());
    assert.equal([...entry.context.discovery.offers.values()].reduce((sum, rows) => sum + rows.length, 0), 60_000,
      'All synthetic offers must satisfy the real modifier validation and remain in the durable discovery snapshot');
    entry.latestSearchResult = { kind: 'search', searchId: entry.id, pendingItems: 376, searchComplete: false,
      items: Array.from({ length: 900 }, (_, i) => ({ optionId: `synthetic-${i}`, auctionId: i, itemId: 700000 + i,
        name: `Synthetic item ${i}`, slotType: 'HEAD', variantKey: `synthetic-${i % 376}`, lotCostCopper: 10000 + i,
        comparison: { baselineDps: 100000, candidateDps: 101000, deltaDps: 1000, deltaPercent: 1 } })) };
    entry.nextSearchPhase = 'simulation'; entry.nextAssemblyPhase = 'discovery';
    entry.excludedOptionIds = ['excluded']; entry.knownOptionIds.add('excluded');
    entry.enhancementState = { checkpoints: { synthetic: { cursor: 7 } } };
    await store.flushAuctionGearSearch(entry);
    const expected = domainState(readAuctionState('search', entry.id).data), rows = [];
    v8.serialize = (...args) => {
      const started = performance.now(), result = originalSerialize(...args);
      if (counts) { counts.serializations++; counts.serializedBytes += result.length; counts.serializationMs += performance.now() - started; }
      return result;
    };
    fs.open = async (...args) => {
      const handle = await originalOpen(...args), write = handle.writeFile.bind(handle);
      handle.writeFile = async (...input) => { if (counts) counts.writes++; return write(...input); };
      return handle;
    };
    syncBuiltinESMExports();
    for (let repeat = 0; repeat < 5; repeat++) {
      // Alternate order to reduce warmup/order bias; both modes run real IO.
      for (const mode of repeat % 2 ? ['pending', 'force'] : ['force', 'pending']) {
        counts = { serializations: 0, serializedBytes: 0, serializationMs: 0, writes: 0 };
        const started = performance.now();
        if (mode === 'force') {
          await store.flushAuctionGearSearch(entry);
          await store.flushAuctionGearSearch(entry);
        } else {
          store.scheduleAuctionGearSearchSave(entry);
          await store.flushPendingAuctionGearSearch(entry);
          await store.flushPendingAuctionGearSearch(entry);
        }
        rows.push({ mode, repeat, elapsedMs: performance.now() - started, ...counts });
        counts = undefined;
        assert.deepEqual(domainState(readAuctionState('search', entry.id).data), expected,
          'Every option, phase, exclusion and checkpoint must be identical after restoration');
      }
    }
    const summary = ['force', 'pending'].map(mode => {
      const selected = rows.filter(row => row.mode === mode), median = key => selected.map(row => row[key]).sort((a, b) => a - b)[2];
      const expectedCount = mode === 'force' ? 2 : 1;
      for (const row of selected) { assert.equal(row.serializations, expectedCount); assert.equal(row.writes, expectedCount); }
      return { mode, serializations: expectedCount, writes: expectedCount, medianMs: median('elapsedMs'), medianSerializationMs: median('serializationMs') };
    });
    console.log(JSON.stringify({ scope: 'Actual store/persistence. Synthetic 60000 market offers and900 result items; five paired local IO runs. Clean publication/final barriers only; not end-to-end production or native latency.', summary, rows }));
  } finally {
    v8.serialize = originalSerialize; fs.open = originalOpen; syncBuiltinESMExports();
    if (entry) store.deleteAuctionGearSearch(entry.owner, entry.id);
    delete process.env.GILDRA_AUCTION_STATE_DIR;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

for (const yielded of [false, true]) test(`actual Runner ${yielded ? 'skips a clean final checkpoint' : 'persists a changed final phase'} after publication`, async () => {
  assert.equal(process.env.GILDRA_AUCTION_STATE_DIR, undefined);
  const directory = await fs.mkdtemp(join(tmpdir(), 'gildra-runner-barrier-'));
  process.env.GILDRA_AUCTION_STATE_DIR = directory;
  let entry;
  const original = v8.serialize;
  try {
    entry = store.createAuctionGearSearch('synthetic-runner-barrier-owner', syntheticContext(0));
    const source = await fs.readFile(new URL('../../../lib/wow/auctionGearRunner.ts', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('function setAuctionGearPhase('), source.indexOf('/** Refresh actual character'));
    let now = 0, serializations = 0, publications = 0;
    v8.serialize = (...args) => { serializations++; return original(...args); }; syncBuiltinESMExports();
    const run = vm.runInNewContext(stripTypeScriptTypes(body).replace(/^export /gm, '') + ';continueAuctionGearSearch', {
      Date: { now: () => now }, comparedOptions: new WeakMap(), metricsFor: () => createAuctionGearDiagnostics(),
      logAuctionGearDiagnostics: () => {}, publicAuctionResult: (_context, result) => result,
      scheduleAuctionGearSearchSave: store.scheduleAuctionGearSearchSave,
      flushPendingAuctionGearSearch: store.flushPendingAuctionGearSearch,
      discoverAuctionOptions: async () => {},
      updateAuctionSearchResult: async current => {
        current.latestSearchResult = { kind: 'search', searchId: current.id, pendingItems: 0, items: [] };
        store.scheduleAuctionGearSearchSave(current);
        if (yielded) now = 11000;
        return current.latestSearchResult;
      },
    });
    await run(entry, new AbortController().signal, () => {}, 'synthetic', result => {
      assert.equal(readAuctionState('search', entry.id).data.latestSearchResult.searchId, result.searchId);
      publications++;
    });
    assert.equal(publications, 1);
    assert.equal(serializations, yielded ? 1 : 2, 'Only a real final phase mutation requires a second full snapshot');
    assert.equal(readAuctionState('search', entry.id).data.nextSearchPhase, yielded ? 'simulation' : 'discovery');
  } finally {
    v8.serialize = original; syncBuiltinESMExports();
    if (entry) store.deleteAuctionGearSearch(entry.owner, entry.id);
    delete process.env.GILDRA_AUCTION_STATE_DIR; await fs.rm(directory, { recursive: true, force: true });
  }
});

test('actual runner preserves cached traversal cursor on cancellation after the previous snapshot committed', async () => {
  assert.equal(process.env.GILDRA_AUCTION_STATE_DIR, undefined);
  const directory = await fs.mkdtemp(join(tmpdir(), 'gildra-cancelled-cursor-'));
  process.env.GILDRA_AUCTION_STATE_DIR = directory;
  const { searchAuctionGearOptions, auctionSelectionEffectKey } = await import('../../../lib/wow/auctionGearPlanner.ts');
  const originalImmediate = globalThis.setImmediate, controller = new AbortController();
  let entry, firstCommitted = false, aborted = false, hookError;
  try {
    const context = syntheticContext(0);
    context.discovery = undefined; context.input.selectedSlots = ['WRIST'];
    context.options = Array.from({ length: 800 }, (_, index) => ({ id: `cached-${index}`, auctionId: index + 1,
      quantity: 1, costCopper: 10, variantKey: 'exact', candidate: { itemId: 100, name: 'Synthetic cached lot',
        slotType: 'WRIST', inventoryType: 9, itemClassId: 4, itemSubclassId: 4, eligible: true,
        constraints: {}, compatibility: { specId: 72 }, variants: [{ key: 'exact', itemLevel: 300, bonusIds: [1] }] } }));
    context.simulate = async () => { throw new Error('Cached traversal must not start native work'); };
    entry = store.createAuctionGearSearch('synthetic-cancelled-cursor-owner', context);
    const measurement = dps => ({ dps, dpsError: 1, iterations: 750, confidence: 95, engine: 'SimulationCraft cancelled-cursor' });
    entry.retainedBaseline = measurement(1000);
    entry.retainedSimulationCache = { [auctionSelectionEffectKey([context.options[0]])]: measurement(1100) };
    const source = await fs.readFile(new URL('../../../lib/wow/auctionGearRunner.ts', import.meta.url), 'utf8');
    const section = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
    const body = section('function publicAuctionResult(', 'function retainAuctionIncumbents(') +
      section('async function updateAuctionSearchResult(', 'export async function startAuctionGearSearch(') +
      section('function setAuctionGearPhase(', '/** Refresh actual character');
    const metrics = createAuctionGearDiagnostics();
    const run = vm.runInNewContext(stripTypeScriptTypes(body).replace(/^export /gm, '') + ';continueAuctionGearSearch', {
      Date, Map, Set, Object, Number, JSON, comparedOptions: new WeakMap(), metricsFor: () => metrics,
      logAuctionGearDiagnostics: () => {}, searchAuctionGearOptions,
      scheduleAuctionGearSearchSave: store.scheduleAuctionGearSearchSave,
      flushPendingAuctionGearSearch: store.flushPendingAuctionGearSearch,
      discoverAuctionOptions: async () => {},
    });
    // Hold the real planner's cooperative boundary until its scheduled snapshot
    // commits, then let another 256 cached lots advance without a new simulation.
    globalThis.setImmediate = (callback, ...args) => originalImmediate(async () => {
      try {
        const cursor = entry.searchCheckpoint?.nextOption;
        if (!firstCommitted && cursor === 256) {
          firstCommitted = true;
          await store.flushPendingAuctionGearSearch(entry);
          assert.equal(readAuctionState('search', entry.id).data.searchCheckpoint.nextOption, 256);
        } else if (firstCommitted && !aborted && cursor === 512) {
          assert.equal(readAuctionState('search', entry.id).data.searchCheckpoint.nextOption, 256,
            'The last committed revision deliberately precedes the live cursor');
          aborted = true; controller.abort();
        }
      } catch (error) { hookError = error; controller.abort(); }
      callback(...args);
    });
    await assert.rejects(run(entry, controller.signal, () => {}, 'synthetic'), { name: 'AbortError' });
    assert.equal(hookError, undefined); assert(firstCommitted && aborted);
    const restored = readAuctionState('search', entry.id).data;
    assert.equal(entry.searchCheckpoint.nextOption, 512);
    assert.equal(restored.searchCheckpoint.nextOption, 512, 'Cancellation must persist progress newer than the last marked snapshot');
    assert.equal(restored.searchCheckpoint.optionOrder.length, 800);
    assert.equal(restored.knownOptionIds.size, 800);
    assert.deepEqual(restored.searchCheckpoint.simulationCache, entry.searchCheckpoint.simulationCache);
    assert.equal(entry.busy, false);
  } finally {
    globalThis.setImmediate = originalImmediate;
    if (entry) store.deleteAuctionGearSearch(entry.owner, entry.id);
    delete process.env.GILDRA_AUCTION_STATE_DIR;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
