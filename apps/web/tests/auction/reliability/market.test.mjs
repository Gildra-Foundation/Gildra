import assert from 'node:assert/strict';
import { test } from 'node:test';
import { harness, offer, record, market } from './market-harness.mjs';
import { getCharacterAuctionMarket } from '../../../lib/wow/auctionMarketProvider.ts';
import { enqueueAuctionGearJob, getAuctionGearJob, cancelAuctionGearJob } from '../../../lib/wow/auctionGearJobs.ts';

// All fixtures are explicitly synthetic. Production source and pure dependencies
// execute unchanged; only catalogue, Battle.net and native transports are mocked.
async function relistUnknown(entity) {
  const h = await harness({ entity });
  const d = h.discovery.createAuctionGearDiscovery(h.state.market, 1000);
  await h.discovery.advanceAuctionGearDiscovery(d, { ...h.discoveryInput, maxSteps: 1 });
  h.discovery.refreshAuctionGearDiscovery(d, market([]));
  await h.discovery.advanceAuctionGearDiscovery(d, { ...h.discoveryInput, maxSteps: 1 });
  h.discovery.refreshAuctionGearDiscovery(d, market([offer(1, 2)]));
  await h.discovery.advanceAuctionGearDiscovery(d, h.discoveryInput);
  return { h, d, coverage: h.discovery.auctionGearDiscoveryCoverage(d) };
}

test('market: relisted item with unknown profession keeps data coverage incomplete', async () => {
  const entity = record();
  entity.tooltip.blocks.push({ type: 'item_requirements', required_skill_id: 164 });
  const { h, d, coverage } = await relistUnknown(entity);
  assert.equal(coverage.discoveryComplete, true);
  assert.equal(coverage.dataComplete, false, 'unverified requirements must never become proven incompatibility');
  assert.equal(coverage.eligibilityUnverifiedItems, 1);
  assert.equal(h.discovery.auctionGearDiscoveryOptions(d).length, 0);
  assert.equal(h.state.variantCalls, 0, 'unknown eligibility must fail closed before native work');
});

test('market: relisted item with missing registry keeps data coverage incomplete', async () => {
  const entity = record(); entity.tooltip.blocks = [];
  const { h, d, coverage } = await relistUnknown(entity);
  assert.equal(coverage.discoveryComplete, true);
  assert.equal(coverage.dataComplete, false);
  assert.equal(coverage.eligibilityUnverifiedItems, 1);
  assert.equal(h.discovery.auctionGearDiscoveryOptions(d).length, 0);
  assert.equal(h.state.variantCalls, 0);
});

test('market: negative reference recovers after TTL for existing and new exact variants', async () => {
  const h = await harness({ availableReference: false });
  const d = h.discovery.createAuctionGearDiscovery(h.state.market, 1000);
  await h.discovery.advanceAuctionGearDiscovery(d, h.discoveryInput);
  assert.equal(h.discovery.auctionGearDiscoveryOptions(d).length, 0);
  assert.equal(h.discovery.auctionGearDiscoveryCoverage(d).referenceItemsRejected, 1);
  const originalNow = Date.now;
  const now = originalNow() + 15 * 60_000 + 1;
  try {
    Date.now = () => now;
    h.state.availableReference = true;
    h.discovery.refreshAuctionGearDiscovery(d, market([offer(), offer(2, 2)], now));
    await h.discovery.advanceAuctionGearDiscovery(d, h.discoveryInput);
    const options = h.discovery.auctionGearDiscoveryOptions(d);
    assert.equal(h.state.referenceCalls, 2, 'expired negative reference must be fetched again');
    assert.equal(options.length, 2, 'both previously rejected and newly arrived effects must recover');
    const coverage = h.discovery.auctionGearDiscoveryCoverage(d);
    assert.equal(coverage.referenceItemsRejected, 0);
    assert.equal(coverage.variantsRejected, 0);
    assert.equal(coverage.dataComplete, true);
  } finally { Date.now = originalNow; }
});

test('market: negative reference is not retried before TTL on every snapshot', async () => {
  const h = await harness({ availableReference: false });
  const d = h.discovery.createAuctionGearDiscovery(h.state.market, 1000);
  await h.discovery.advanceAuctionGearDiscovery(d, h.discoveryInput);
  h.discovery.refreshAuctionGearDiscovery(d, market([offer(), offer(2, 2)]));
  await h.discovery.advanceAuctionGearDiscovery(d, h.discoveryInput);
  assert.equal(h.state.referenceCalls, 1, 'negative retry must be bounded');
  assert.equal(h.discovery.auctionGearDiscoveryCoverage(d).dataComplete, false);
});

test('market: cosmetic profile fields do not invalidate a combat snapshot', async () => {
  const h = await harness(); const run = await h.start();
  h.state.armory = structuredClone(h.state.armory);
  h.state.armory.profile.achievement_points++;
  h.state.armory.profile.last_login_timestamp++;
  await assert.doesNotReject(h.runner.verifyAuctionGearSearch(run.entry, 'unused-synthetic', h.signal(), false));
});

test('market: harmless profile key and equipment order do not invalidate a snapshot', async () => {
  const h = await harness();
  h.state.armory.equipment.equipped_items.push({ item: { id: 99999 }, slot: { type: 'HEAD' }, name: 'Synthetic head' });
  const run = await h.start();
  h.state.armory = structuredClone(h.state.armory);
  h.state.armory.profile = Object.fromEntries(Object.entries(h.state.armory.profile).reverse());
  h.state.armory.equipment.equipped_items.reverse();
  await assert.doesNotReject(h.runner.verifyAuctionGearSearch(run.entry, 'unused-synthetic', h.signal(), false));
});

const mechanics = {
  level: armory => { armory.profile.level++; },
  talents: armory => { armory.activeTalentLoadout = 'synthetic-different-talents'; },
  item: armory => { armory.equipment.equipped_items[0].item.id++; },
  bonuses: armory => { armory.equipment.equipped_items[0].bonus_list = [12345]; },
  enchantments: armory => { armory.equipment.equipped_items[0].enchantments = [{ enchantment_id: 12345 }]; },
  gems: armory => { armory.equipment.equipped_items[0].sockets = [{ item: { id: 12345 } }]; },
};
for (const [name, change] of Object.entries(mechanics)) test(`market: changed combat ${name} invalidates the snapshot`, async () => {
  const h = await harness(); const run = await h.start();
  h.state.armory = structuredClone(h.state.armory); change(h.state.armory);
  await assert.rejects(h.runner.verifyAuctionGearSearch(run.entry, 'unused-synthetic', h.signal(), false), /character_snapshot_changed/);
});

test('market: runner forwards caller cancellation to initial and refreshed market reads', async () => {
  const h = await harness(); const run = await h.start();
  await h.runner.verifyAuctionGearSearch(run.entry, 'unused-synthetic', h.signal(), false);
  assert.equal(h.state.marketSignals.length, 2);
  assert(h.state.marketSignals.every(signal => signal instanceof AbortSignal), 'market calls must retain caller cancellation');
});

const pause = () => new Promise(resolve => setTimeout(resolve, 1));
async function waitFor(predicate, message) {
  for (let index = 0; index < 100; index++) { if (predicate()) return; await pause(); }
  assert.fail(message);
}

test('market: cancelling one consumer releases Jobs while another keeps its shared fetch', async () => {
  const originalFetch = globalThis.fetch;
  let release, entered, upstreamSignal, secondStarted = false, sharedResolved = false;
  const requested = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const consumer = new AbortController();
  const character = { region: 'eu', realm: { slug: 'offline-reliability-cancellation' } };
  const connectedId = 987650001;
  let auctionsRequested = 0, cancelled, shared;
  try {
    globalThis.fetch = async (url, options) => {
      if (String(url).includes('/data/wow/realm/')) return Response.json({ connected_realm: { href: `https://eu.api.blizzard.com/data/wow/connected-realm/${connectedId}` } });
      assert(String(url).includes(`/connected-realm/${connectedId}/auctions`));
      auctionsRequested++; upstreamSignal = options.signal; entered();
      await held;
      return Response.json({ auctions: [] }, { headers: { 'last-modified': new Date().toUTCString() } });
    };
    cancelled = enqueueAuctionGearJob('offline-reliability-cancel-a', async signal => {
      const result = await getCharacterAuctionMarket(character, 'unused-synthetic', { refresh: true, signal });
      signal.throwIfAborted(); return result;
    });
    await requested;
    shared = getCharacterAuctionMarket(character, 'unused-synthetic', { refresh: true, signal: consumer.signal }).then(result => { sharedResolved = true; return result; });
    await pause();
    const next = enqueueAuctionGearJob('offline-reliability-cancel-b', async () => { secondStarted = true; return { synthetic: true }; });
    cancelAuctionGearJob('offline-reliability-cancel-a', cancelled.id);
    await waitFor(() => secondStarted, 'cancelled market read must release the global Jobs queue before shared fetch resolves');
    assert.equal(getAuctionGearJob('offline-reliability-cancel-b', next.id).status, 'completed');
    assert.equal(sharedResolved, false, 'other consumer must still wait for its market response');
    assert.equal(upstreamSignal.aborted, false, 'one consumer must not abort a shared fetch needed by another');
    assert.equal(auctionsRequested, 1);
    release();
    const result = await shared;
    assert.equal(result.connectedRealmId, connectedId);
    assert.equal(sharedResolved, true);
  } finally {
    release?.();
    await shared?.catch(() => {});
    globalThis.fetch = originalFetch;
  }
});
