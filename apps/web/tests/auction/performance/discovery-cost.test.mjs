import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { test } from 'node:test';
import { normalizeGearCandidate } from '../../../lib/wow/gearCandidates.ts';
import { auctionVariantKey, resolvedAuctionVariant } from '../../../lib/wow/auctionItemVariant.ts';
import { supportedAuctionModifiers } from '../../../lib/wow/gearItemModifiers.ts';
import { AUCTION_ITEM_REFERENCE_TTL_MS, nativeMatchesItemReference } from '../../../lib/wow/auctionItemReference.ts';

// All facts/transports are synthetic. No market, credentials, disk checkpoints,
// database, HTTP, or native processes are accessed by these measurements.
const path = 'apps/web/lib/wow/auctionGearDiscovery.ts';
const current = readFileSync(new URL('../../../lib/wow/auctionGearDiscovery.ts', import.meta.url), 'utf8');
const root = new URL('../../../../../', import.meta.url);
// Historical timing is opt-in; functional checks need no git history (including
// shallow CI checkouts). Reproduce the original comparison with this variable
// set to 37f3cfbea1ea7374b9d0b8efef11e8b8cdb76e86.
const baselineRevision = process.env.AUCTION_DISCOVERY_BENCHMARK_BASE;
const baseline = baselineRevision ? execFileSync('git', ['show', `${baselineRevision}:${path}`], { cwd: root, encoding: 'utf8' }) : null;
const strip = source => stripTypeScriptTypes(source, { mode: 'strip' }).replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');
const offer = (itemId, auctionId, bonus = 1) => ({ itemId, auctionId, quantity: 1, buyoutCopper: 100, contextId: 13, bonusIds: [bonus], modifiers: [] });
const market = offers => ({ id: 'synthetic', region: 'eu', connectedRealmId: 1, sourceUpdatedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), offers });
const record = id => ({ id: `synthetic-${id}`, externalId: id, type: 'item', name: `Synthetic ${id}`, slug: `synthetic-${id}`, itemLevel: 100,
  highlights: [{ key: 'inventory_type', value: 'Wrist' }], payload: { ItemLevel: 100, ExpansionID: 11 },
  tooltip: { blocks: [{ type: 'item_registry', class_id: 4, subclass_id: 4, inventory_type: 9 }] } });
const context = slotType => ({ classId: 1, specId: 72, characterLevel: 81, raceId: 1, faction: 'ALLIANCE', slotType,
  currentItemLevel: 0, anchorItemClassId: -1, anchorItemSubclassId: -1, season: { id: 'synthetic', patch: 'synthetic', expansionId: 11, activityNames: [] },
  acquisition: { type: 'auction', evidence: 'auction' } });
function fixture(source, items = 376, lotsPerItem = 2) {
  const counts = { native: 0, probes: [], abortNative: null };
  const api = new vm.Script(strip(source) + '\n;({createAuctionGearDiscovery,advanceAuctionGearDiscovery,refreshAuctionGearDiscovery,auctionGearDiscoveryComplete,auctionGearDiscoveryOptions,auctionGearDiscoveryCoverage})').runInNewContext({
    Date, Map, Set, Object, Number, JSON, normalizeGearCandidate, auctionVariantKey, resolvedAuctionVariant,
    supportedAuctionModifiers, AUCTION_ITEM_REFERENCE_TTL_MS, nativeMatchesItemReference,
    lookupGearRecords: async (ids, _locale, _class, _level, signal, _cache, opts = {}) => { signal.throwIfAborted(); return opts.cachedOnly ? [] : ids.map(record); },
    gearEntityDetails: async rows => rows,
    getAuctionItemReferences: async ids => new Map(ids.map(id => [id, { offer: offer(id, id, 2), requiredLevel: 1, itemLevel: 100, stats: [] }])),
    resolveAuctionVariants: async ({ offers, signal }) => {
      counts.native++; counts.probes.push(offers.length);
      counts.abortNative?.();
      // Deliberately return after abort to exercise the caller's commit fence.
      return { engine: 'SimulationCraft synthetic-cost', variants: new Map(offers.map(({ offer: row }) => [auctionVariantKey(row), {
        key: auctionVariantKey(row), itemId: row.itemId, itemLevel: 100, requiredLevel: 1, inventoryType: 9,
        itemClassId: 4, itemSubclassId: 4, quality: 3, uniqueEquipped: false, setId: 0, stats: {},
      }])) };
    },
  });
  const offers = Array.from({ length: items }, (_, i) => Array.from({ length: lotsPerItem }, (_, j) => offer(i + 1, i * lotsPerItem + j + 1))).flat();
  const state = api.createAuctionGearDiscovery(market(offers), 1000);
  const input = { locale: 'en_US', region: 'eu', token: 'synthetic', spec: 'fury-warrior', characterLevel: 81,
    selectedSlots: ['WRIST'], context, signal: new AbortController().signal, maxSteps: 1 };
  async function finish() { for (let i = 0; !api.auctionGearDiscoveryComplete(state); i++) { assert(i < 2000); await api.advanceAuctionGearDiscovery(state, input); } }
  return { api, state, input, counts, offers, finish };
}

test('larger continuation batches preserve every lot and exact-reference verification', async () => {
  const after = fixture(current);
  await after.finish();
  const plain = value => JSON.parse(JSON.stringify(value));
  const rows = after.api.auctionGearDiscoveryOptions(after.state);
  assert.deepEqual(plain(rows.map(row => ({ auctionId: row.auctionId, itemId: row.candidate.itemId, quantity: row.quantity,
    costCopper: row.costCopper, variantKey: row.variantKey, slotType: row.candidate.slotType, itemLevel: row.candidate.itemLevel }))),
  after.offers.map(row => ({ auctionId: row.auctionId, itemId: row.itemId, quantity: row.quantity,
    costCopper: row.buyoutCopper, variantKey: auctionVariantKey(row), slotType: 'WRIST', itemLevel: 100 })));
  const coverage = after.api.auctionGearDiscoveryCoverage(after.state);
  assert.equal(coverage.matchedLots, after.offers.length);
  assert.equal(coverage.variantsResolved, 376);
  assert.equal(coverage.variantsPending, 0);
  assert.equal(coverage.dataComplete, true);
  assert.equal(coverage.discoveryComplete, true);
  assert.equal(after.state.verifiedReferences.size, 376);
  assert(after.counts.probes.every(size => size <= 16));
  assert(after.counts.native <= 47);
  if (!baseline) return;
  const before = fixture(baseline);
  await before.finish();
  assert.deepEqual(plain(rows), plain(before.api.auctionGearDiscoveryOptions(before.state)));
  assert.deepEqual(plain(coverage), plain(before.api.auctionGearDiscoveryCoverage(before.state)));
  assert(after.counts.native <= Math.ceil(before.counts.native / 2));
  // Repeat the caller's options/coverage reads with a full domain of actual
  // gear lots. Previous warm-5001 fixtures mostly represented noncombat items.
  const timed = h => {
    const began = performance.now();
    for (let i = 0; i < 300; i++) { assert.equal(h.api.auctionGearDiscoveryOptions(h.state).length, 752); assert.equal(h.api.auctionGearDiscoveryCoverage(h.state).matchedLots, 752); }
    return performance.now() - began;
  };
  timed(before); timed(after);
  const samples = { before: [], after: [] };
  for (let i = 0; i < 5; i++) { samples.before.push(timed(before)); samples.after.push(timed(after)); }
  console.log(JSON.stringify({ scope: 'Synthetic 376 native gear variants / 752 auction lots; 300 options+coverage reads; real discovery', nativeRequests: { before: before.counts.native, after: after.counts.native }, milliseconds: samples }));
});

test('cached options follow refresh prices, quantities, disappeared lots and new candidates', async () => {
  const h = fixture(current, 8); await h.finish();
  const original = h.api.auctionGearDiscoveryOptions(h.state);
  original.reverse(); original.pop(); // The returned array is detached.
  assert.equal(h.api.auctionGearDiscoveryOptions(h.state)[0].auctionId, 1);
  assert.equal(h.api.auctionGearDiscoveryOptions(h.state).length, 16);
  const next = h.offers.slice(1).map((row, i) => i === 0 ? { ...row, quantity: 2, buyoutCopper: 300 } : row);
  next.push(offer(9, 99));
  h.api.refreshAuctionGearDiscovery(h.state, market(next));
  await h.finish();
  const rows = h.api.auctionGearDiscoveryOptions(h.state);
  assert(!rows.some(row => row.auctionId === 1));
  assert.equal(rows.find(row => row.auctionId === 2).quantity, 2);
  assert.equal(rows.find(row => row.auctionId === 2).costCopper, 300);
  assert(rows.some(row => row.auctionId === 99));
  // Coverage must count a stack once even if a variant has two slot options.
  const key = rows[0].variantKey, candidates = h.state.candidates.get(key);
  h.state.candidates.set(key, [...candidates, { ...candidates[0], slotType: 'FINGER_2' }]);
  assert.equal(h.api.auctionGearDiscoveryCoverage(h.state).matchedLots, next.length);
});

test('first-use batches remain small and cancellation cannot commit native candidates or cursor', async () => {
  const h = fixture(current, 16);
  await h.api.advanceAuctionGearDiscovery(h.state, { ...h.input, stopAfterNewCandidates: true, maxSteps: 12 });
  assert.equal(h.state.candidates.size, 4);
  assert.equal(h.counts.probes[0], 8);
  const cursor = h.state.variantCursor, candidates = h.state.candidates.size;
  const controller = new AbortController(); h.counts.abortNative = () => controller.abort();
  await assert.rejects(h.api.advanceAuctionGearDiscovery(h.state, { ...h.input, signal: controller.signal }), /abort/i);
  assert.equal(h.state.variantCursor, cursor); assert.equal(h.state.candidates.size, candidates);
  h.counts.abortNative = null; await h.finish();
  assert.equal(h.state.candidates.size, 16);
  assert.equal(h.api.auctionGearDiscoveryOptions(h.state).length, 32);
});
