import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { createAuctionGearDiagnostics } from '../../../lib/wow/auctionGearDiagnostics.ts';
import { auctionGearProfileFingerprint } from '../../../lib/wow/auctionGearFingerprint.ts';
import { auctionVariantKey } from '../../../lib/wow/auctionItemVariant.ts';

// Execute the actual verifier with synthetic transport boundaries. Neither this
// fixture nor the timing comparison contacts Blizzard, a worker or an account.
const runnerSource = await readFile(new URL('../../../lib/wow/auctionGearRunner.ts', import.meta.url), 'utf8');
const begin = runnerSource.indexOf('export async function verifyAuctionGearSearch(');
const end = runnerSource.indexOf('\nexport type AuctionGearAssemblySelection', begin);
assert(begin >= 0 && end > begin, 'Locate the actual continuation verifier');
const verifierSource = stripTypeScriptTypes(runnerSource.slice(begin, end), { mode: 'strip' }).replace(/^export /, '');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const character = { id: 1, name: 'Synthetic', region: 'eu', realm: { slug: 'synthetic' } };
  const armory = { profile: { level: 81, character_class: { id: 1 }, race: { id: 1 } },
    equipment: { equipped_items: [] }, activeSpecializationId: 72, activeTalentLoadout: 'synthetic-offline' };
  const offer = { auctionId: 2, itemId: 3, contextId: 1, bonusIds: [4], modifiers: [], quantity: 1, buyoutCopper: 100 };
  const market = { id: 'fresh', region: 'eu', connectedRealmId: 5, offers: [offer],
    sourceUpdatedAt: new Date().toUTCString(), fetchedAt: new Date().toISOString() };
  const entry = { context: { character, profileFingerprint: auctionGearProfileFingerprint(armory),
    input: { characterSlug: 'eu--synthetic--synthetic', locale: 'en', budgetCopper: 1000 },
    market: { ...market, id: 'previous' }, publicMarket: { snapshotId: 'previous' },
    options: [{ id: 'synthetic-option', auctionId: offer.auctionId, variantKey: auctionVariantKey(offer),
      costCopper: offer.buyoutCopper, quantity: offer.quantity }] } };
  const state = { events: [], writes: 0, updates: 0, character, armory, market, entry };
  const diagnostics = createAuctionGearDiagnostics();
  state.dependencies = {
    metricsFor: () => diagnostics,
    getBattleNetCharacterBySlug: async (token, locale, slug, signal, options) => {
      state.events.push('ownership');
      assert.equal(token, 'synthetic-unused-token'); assert.equal(locale, 'en');
      assert.equal(slug, entry.context.input.characterSlug); assert.equal(options.cache, 'no-store');
      signal.throwIfAborted();
      return state.ownership ? state.ownership(signal) : character;
    },
    getBattleNetSimulationSnapshot: async (token, owned, signal) => {
      state.events.push('profile');
      assert.equal(token, 'synthetic-unused-token'); assert.equal(owned, character); signal.throwIfAborted();
      return state.profile ? state.profile(signal) : state.armory;
    },
    getCharacterAuctionMarket: async (owned, token, options) => {
      state.events.push('market');
      assert.equal(token, 'synthetic-unused-token'); assert.equal(owned, character);
      assert.equal(options.refresh, true, 'Each continuation must request upstream revalidation');
      options.signal.throwIfAborted();
      return state.marketRead ? state.marketRead(options.signal) : state.market;
    },
    auctionGearProfileFingerprint, auctionVariantKey,
    synchronizeAuctionOptions: (entry, options) => { state.updates++; entry.context.options = options; },
    flushAuctionGearSearch: async () => { state.writes++; },
  };
  return state;
}
function verifier(state, source = verifierSource) {
  return new vm.Script(`${source}\n;verifyAuctionGearSearch`).runInNewContext(state.dependencies);
}
function execute(state, signal = new AbortController().signal, source) {
  return verifier(state, source)(state.entry, 'synthetic-unused-token', signal);
}

test('fresh ownership succeeds before profile and market start together', { timeout: 5000 }, async () => {
  const state = fixture(), ownership = deferred(), profile = deferred(), market = deferred();
  state.ownership = () => ownership.promise; state.profile = () => profile.promise; state.marketRead = () => market.promise;
  const pending = execute(state);
  await nextTurn(); assert.deepEqual(state.events, ['ownership']);
  ownership.resolve(state.character);
  await nextTurn(); assert.deepEqual(state.events, ['ownership', 'profile', 'market']);
  assert.equal(state.writes, 0);
  market.resolve(state.market);
  await nextTurn(); assert.equal(state.writes, 0, 'A fast market cannot publish before profile validation');
  profile.resolve(state.armory); await pending;
  assert.equal(state.writes, 1); assert.equal(state.updates, 1);
  assert.equal(state.entry.context.publicMarket.snapshotId, state.market.id);
});

for (const failure of ['missing', 'identity', 'transport']) {
  test(`ownership ${failure} prevents both dependent fresh reads`, async () => {
    const state = fixture();
    state.ownership = async () => {
      if (failure === 'transport') throw new Error('ownership_unavailable');
      return failure === 'missing' ? null : { ...state.character, id: 99 };
    };
    await assert.rejects(execute(state), failure === 'transport' ? /ownership_unavailable/ : /character_not_found/);
    assert.deepEqual(state.events, ['ownership']); assert.equal(state.writes, 0); assert.equal(state.updates, 0);
  });
}

for (const failure of ['profile changed', 'market region changed', 'connected realm changed', 'market stale', 'profile unavailable']) {
  test(`${failure} still rejects before replacing retained options or publishing`, async () => {
    const state = fixture(), original = JSON.stringify(state.entry);
    let expected;
    if (failure === 'profile changed') {
      state.armory = { ...state.armory, profile: { ...state.armory.profile, level: 82 } }; expected = /character_snapshot_changed/;
    } else if (failure === 'market region changed' || failure === 'connected realm changed') {
      state.market = { ...state.market, ...(failure === 'market region changed' ? { region: 'us' } : { connectedRealmId: 6 }) };
      expected = /auction_market_changed/;
    } else if (failure === 'market stale') {
      state.marketRead = async () => { throw new Error('market_stale'); }; expected = /market_stale/;
    } else {
      state.profile = async () => { throw new Error('profile_unavailable'); }; expected = /profile_unavailable/;
    }
    await assert.rejects(execute(state), expected);
    assert.deepEqual(state.events, ['ownership', 'profile', 'market']);
    assert.equal(JSON.stringify(state.entry), original); assert.equal(state.updates, 0); assert.equal(state.writes, 0);
  });
}

test('every repeated continuation makes all fresh reads and applies changed price and quantity', async () => {
  const state = fixture();
  await execute(state);
  state.market = { ...state.market, id: 'repriced', offers: [{ ...state.market.offers[0], buyoutCopper: 150, quantity: 2 }] };
  await execute(state);
  assert.deepEqual(state.events, ['ownership', 'profile', 'market', 'ownership', 'profile', 'market']);
  assert.equal(state.entry.context.options[0].costCopper, 150); assert.equal(state.entry.context.options[0].quantity, 2);
  assert.equal(state.entry.context.marketChange.repricedLots, 1); assert.equal(state.entry.context.marketChange.quantityChangedLots, 1);
  assert.equal(state.writes, 2);
});

test('pre-abort performs no work and in-flight abort reaches both reads without publishing', { timeout: 5000 }, async () => {
  const before = fixture(), stopped = new AbortController(); stopped.abort();
  await assert.rejects(execute(before, stopped.signal), { name: 'AbortError' });
  assert.deepEqual(before.events, []);
  const state = fixture(), controller = new AbortController(), ready = deferred(), aborted = [];
  const block = name => signal => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { aborted.push(name); reject(signal.reason); }, { once: true });
    if (name === 'market') ready.resolve();
  });
  state.profile = block('profile'); state.marketRead = block('market');
  const pending = execute(state, controller.signal);
  await ready.promise;
  const rejected = assert.rejects(pending, { name: 'AbortError' }); controller.abort(); await rejected;
  assert.deepEqual(aborted, ['profile', 'market']); assert.equal(state.updates, 0); assert.equal(state.writes, 0);
});

test('late transport resolutions after abort cannot update retained state', async () => {
  const state = fixture(), controller = new AbortController(), profile = deferred(), market = deferred();
  state.profile = () => profile.promise; state.marketRead = () => market.promise;
  const pending = execute(state, controller.signal);
  await nextTurn(); controller.abort(); profile.resolve(state.armory); market.resolve(state.market);
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(state.updates, 0); assert.equal(state.writes, 0);
});

test('equal-latency dependency benchmark retains call count while removing one sequential wait', async t => {
  // Restore only the old serialized read scheduling in the same extracted
  // production function. Fresh ownership, validation and publication stay equal.
  const parallelReads = /const \[current, market\] = await Promise\.all\(\[\s*diagnostics\.measureStage\("armory", \(\) => getBattleNetSimulationSnapshot\(token, context\.character, signal\)\),\s*diagnostics\.measureStage\("market", \(\) => getCharacterAuctionMarket\(context\.character, token, \{ refresh: true, signal \}\)\),?\s*\]\);/;
  assert(parallelReads.test(verifierSource), 'Benchmark requires the explicit concurrent fresh-read boundary');
  const serialSource = verifierSource.replace(parallelReads,
    'const current = await getBattleNetSimulationSnapshot(token, context.character, signal);\n' +
    'signal.throwIfAborted();\n' +
    'if (auctionGearProfileFingerprint(current) !== context.profileFingerprint) throw new Error("character_snapshot_changed");\n' +
    'const market = await getCharacterAuctionMarket(context.character, token, { refresh: true, signal });');
  const delayMs = 30, before = [], after = [];
  for (let iteration = 0; iteration < 5; iteration++) {
    // Alternate order to reduce warmup and unrelated shared-host drift.
    for (const mode of iteration % 2 ? ['after', 'before'] : ['before', 'after']) {
      const state = fixture(), delay = value => new Promise(resolve => setTimeout(() => resolve(value), delayMs));
      state.ownership = () => delay(state.character); state.profile = () => delay(state.armory); state.marketRead = () => delay(state.market);
      const run = verifier(state, mode === 'before' ? serialSource : verifierSource), started = performance.now();
      await run(state.entry, 'synthetic-unused-token', new AbortController().signal);
      (mode === 'before' ? before : after).push(performance.now() - started);
      assert.deepEqual(state.events, ['ownership', 'profile', 'market']); assert.equal(state.writes, 1);
    }
  }
  const median = samples => Math.round([...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)] * 100) / 100;
  t.diagnostic(JSON.stringify({ method: 'actual verifier; synthetic 30ms per dependency; no live latency claim',
    samplesPerVersion: before.length, dependencyCallsPerVerification: 3, beforeMedianMs: median(before), afterMedianMs: median(after) }));
  // The held-promise test above proves overlap without timing thresholds, which
  // would be flaky under shared-host load. Wall time here is evidence only.
});
