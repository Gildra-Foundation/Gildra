import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import fs from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { registerHooks, stripTypeScriptTypes, syncBuiltinESMExports } from 'node:module';
import vm from 'node:vm';
import v8 from 'node:v8';
import * as store from '../../../lib/wow/auctionGearSearchStore.ts';
import { readAuctionState } from '../../../lib/wow/auctionGearPersistence.ts';
import { createAuctionGearDiscovery } from '../../../lib/wow/auctionGearDiscovery.ts';
import { selectedAuctionGearAssemblyOptions } from '../../../lib/wow/auctionGearRunner.ts';
import { auctionGearVariantSelectionKey } from '../../../lib/wow/auctionGearExclusions.ts';
import { getOwnerActiveAuctionGearJob } from '../../../lib/wow/auctionGearJobs.ts';

const routeFile = new URL('../../../app/api/wow/auction-gear-plans/route.ts', import.meta.url);
const beforeSource = await readFile(new URL('./fixtures/assembly-admission-before-identical-selection.ts.txt', import.meta.url), 'utf8');
const source = await readFile(routeFile, 'utf8');
const start = source.indexOf('      const beforeAcceptance = allowed ?');
const currentSource = source.slice(start, source.indexOf('      const job = enqueueAuctionGearJob', start));
const tick = () => new Promise(resolve => setImmediate(resolve));
const digest = value => createHash('sha256').update(value).digest('hex');
let session = null, taskStarts = 0;
globalThis.__auctionAdmissionTest = {
  auth: () => session,
  start: async () => { throw Error('unexpected_start'); },
  select: selectedAuctionGearAssemblyOptions,
  assemble: async entry => { taskStarts++; return { kind: 'assembly', searchId: entry.id, purchases: [], exhaustiveComplete: false }; },
};
const hook = registerHooks({ resolve(specifier, context, nextResolve) {
  const moduleURL = code => `data:text/javascript,${encodeURIComponent(code)}`;
  if (specifier === '@/auth') return { url: moduleURL('export async function auth(){return globalThis.__auctionAdmissionTest.auth()}'), shortCircuit: true };
  if (specifier === '@/lib/wow/auctionGearRunner') return { url: moduleURL(`
    export const startAuctionGearSearch=(...args)=>globalThis.__auctionAdmissionTest.start(...args);
    export const continueAuctionGearSearch=async()=>{throw Error('unexpected_resume')};
    export const verifyAuctionGearSearch=async()=>{};
    export const selectedAuctionGearAssemblyOptions=(...args)=>globalThis.__auctionAdmissionTest.select(...args);
    export const assembleAuctionGearSearch=(...args)=>globalThis.__auctionAdmissionTest.assemble(...args);
  `), shortCircuit: true };
  if (specifier === 'next/server') return nextResolve('next/server.js', context);
  return nextResolve(specifier, context);
} });
const route = await import(routeFile.href);
after(() => { hook.deregister(); delete globalThis.__auctionAdmissionTest; });

function context(offerCount = 0) {
  const timestamp = new Date().toISOString();
  const offers = Array.from({ length: offerCount }, (_, i) => ({ auctionId: i + 1, itemId: 700000 + i % 6000,
    quantity: 1 + i % 3, buyoutCopper: 10000 + i * 17, contextId: 13, bonusIds: [9000 + i % 376], modifiers: [{ type: 9, value: 90 }] }));
  const market = { id: 'synthetic', region: 'eu', connectedRealmId: 1, sourceUpdatedAt: timestamp, fetchedAt: timestamp, offers };
  return { input: { locale: 'en', characterSlug: 'synthetic', budgetCopper: 10000000, scenario: 'single-target', selectedSlots: ['HEAD'] },
    character: { id: 1, level: 90, playableClass: { id: 1 }, playableRace: { id: 1 }, faction: { type: 'ALLIANCE' } },
    armory: { equipment: { equipped_items: [] }, profile: {}, specializations: {}, activeTalentLoadout: 'synthetic' },
    options: [1, 2, 3].map(i => ({ id: `lot-${i}`, auctionId: i, variantKey: 'synthetic', candidate: { itemId: i } })),
    loadout: [], specId: 72, specSlug: 'fury-warrior', market: { ...market, offers: [] }, currentBySlot: new Map(),
    discovery: createAuctionGearDiscovery(market, 10000000), discoverySeason: { id: 'synthetic', patch: 'synthetic', expansionId: 11, activityNames: [] },
    encounter: { fightLengthSeconds: 120, targets: 1 }, coverage: {}, searchLimited: true, publicMarket: {},
    profileFingerprint: 'synthetic', scenario: 'single-target', marketChange: {}, simulate: async () => {}, discoveryContext: () => {},
  };
}
async function fixture(run, offerCount = 0) {
  assert.equal(process.env.GILDRA_AUCTION_STATE_DIR, undefined, 'Never access a live service directory');
  const directory = await mkdtemp(join(tmpdir(), 'gildra-admission-'));
  process.env.GILDRA_AUCTION_STATE_DIR = directory;
  const token = `synthetic-${randomUUID()}`, owner = digest(`battle-net:${token}`);
  session = { battleNetAccessToken: token };
  const entry = store.createAuctionGearSearch(owner, context(offerCount));
  try { await run(entry, directory); }
  finally { await tick(); session = null; store.deleteAuctionGearSearch(owner, entry.id); delete process.env.GILDRA_AUCTION_STATE_DIR; await rm(directory, { recursive: true, force: true }); }
}
async function post(entry, body = {}) {
  const response = await route.POST(new Request('https://gildra.example/api/wow/auction-gear-plans', { method: 'POST',
    headers: { host: 'gildra.example', origin: 'https://gildra.example' },
    body: JSON.stringify({ action: 'assemble', searchId: entry.id, excludedOptionIds: [], excludedVariantKeys: [], ...body }) }));
  const payload = await response.json(); await tick(); return { status: response.status, body: payload };
}
function instrument() {
  const originals = { serialize: v8.serialize, writeFileSync: fs.writeFileSync, fsyncSync: fs.fsyncSync };
  let stats;
  v8.serialize = (...args) => {
    const started = performance.now(), bytes = originals.serialize(...args);
    if (stats && args[0]?.kind === 'search') { stats.serializations++; stats.serializedBytes += bytes.length; stats.serializeMs += performance.now() - started; }
    return bytes;
  };
  fs.writeFileSync = (...args) => { if (stats) stats.writes++; return originals.writeFileSync(...args); };
  fs.fsyncSync = (...args) => { if (stats) stats.fsyncs++; return originals.fsyncSync(...args); };
  syncBuiltinESMExports();
  return { reset() { stats = { serializations: 0, serializedBytes: 0, serializeMs: 0, writes: 0, fsyncs: 0 }; }, get stats() { return stats; },
    restore() { v8.serialize = originals.serialize; fs.writeFileSync = originals.writeFileSync; fs.fsyncSync = originals.fsyncSync; syncBuiltinESMExports(); } };
}
function admission(code, entry, body = { excludedOptionIds: [], excludedVariantKeys: [] }, save = store.saveAuctionGearSearch) {
  return new vm.Script(stripTypeScriptTypes(code) + ';beforeAcceptance').runInNewContext({
    entry, allowed: entry.context.options.filter(option => !body.excludedOptionIds.includes(option.id)),
    hasExcluded: true, hasVariants: true, body, variants: body.excludedVariantKeys, Set,
    selectionDurabilityUnknown: new WeakSet(), saveAuctionGearSearch: save,
  });
}

test('actual API saves the initial empty selection, skips an exact repeat, and retains it on disk', async () => fixture(async entry => {
  const meter = instrument();
  try {
    assert.equal(entry.excludedOptionIds, undefined); assert.equal(entry.excludedVariantKeys, undefined);
    meter.reset(); assert.equal((await post(entry)).status, 202); assert.equal(meter.stats.serializations, 1);
    meter.reset(); assert.equal((await post(entry)).status, 202); assert.equal(meter.stats.serializations, 0);
    const durable = readAuctionState('search', entry.id).data;
    assert.deepEqual(durable.excludedOptionIds, []); assert.deepEqual(durable.excludedVariantKeys, []);
    globalThis.__gildraAuctionGearSearches.delete(entry.id);
    const restored = store.getAuctionGearSearch(entry.owner, entry.id);
    assert.deepEqual(restored.excludedOptionIds, []); assert.deepEqual(restored.excludedVariantKeys, []);
  } finally { meter.restore(); }
}));

test('an absent variant selection is distinct from an explicitly empty persisted array', async () => fixture(async entry => {
  entry.excludedOptionIds = []; store.saveAuctionGearSearch(entry);
  const meter = instrument();
  try {
    meter.reset(); assert.equal((await post(entry)).status, 202); assert.equal(meter.stats.serializations, 1);
    assert.deepEqual(readAuctionState('search', entry.id).data.excludedVariantKeys, []);
  } finally { meter.restore(); }
}));

test('changed and reordered option or variant exclusions still save before acceptance', async () => fixture(async entry => {
  const meter = instrument(), one = auctionGearVariantSelectionKey({ itemId: 1, variantKey: 'synthetic' }),
    two = auctionGearVariantSelectionKey({ itemId: 2, variantKey: 'synthetic' });
  try {
    const selections = [
      { excludedOptionIds: ['lot-1', 'lot-2'], excludedVariantKeys: [] },
      { excludedOptionIds: ['lot-2', 'lot-1'], excludedVariantKeys: [] },
      { excludedOptionIds: ['lot-2', 'lot-1'], excludedVariantKeys: [one, two] },
      { excludedOptionIds: ['lot-2', 'lot-1'], excludedVariantKeys: [two, one] },
    ];
    for (const selection of selections) {
      meter.reset(); assert.equal((await post(entry, selection)).status, 202); assert.equal(meter.stats.serializations, 1);
      const durable = readAuctionState('search', entry.id).data;
      assert.deepEqual(durable.excludedOptionIds, selection.excludedOptionIds); assert.deepEqual(durable.excludedVariantKeys, selection.excludedVariantKeys);
    }
    meter.reset(); assert.equal((await post(entry, selections.at(-1))).status, 202); assert.equal(meter.stats.serializations, 0);
  } finally { meter.restore(); }
}));

test('accepted request replay bypasses admission while a changed fingerprint or invalid selection still fails', async () => fixture(async entry => {
  const clientRequestId = `synthetic-${randomUUID()}`, selection = { clientRequestId, excludedOptionIds: ['lot-1'] }, meter = instrument();
  try {
    meter.reset(); const first = await post(entry, selection); assert.equal(first.status, 202); assert.equal(meter.stats.serializations, 1);
    const starts = taskStarts;
    meter.reset(); const replay = await post(entry, selection); assert.equal(replay.status, 202);
    assert.equal(replay.body.id, first.body.id); assert.equal(taskStarts, starts); assert.equal(meter.stats.serializations, 0);
    assert.equal((await post(entry, { ...selection, excludedOptionIds: [] })).status, 400);
    assert.equal((await post(entry, { excludedOptionIds: ['unknown-lot'] })).status, 400);
    assert.deepEqual(entry.excludedOptionIds, ['lot-1']); assert.equal(meter.stats.serializations, 0);
  } finally { meter.restore(); }
}));

test('a busy job rejects a changed selection without running its admission callback', async () => fixture(async entry => {
  const original = globalThis.__auctionAdmissionTest.assemble, meter = instrument();
  let release; const gate = new Promise(resolve => { release = resolve; });
  globalThis.__auctionAdmissionTest.assemble = async current => { await gate; return original(current); };
  try {
    assert.equal((await post(entry, { excludedOptionIds: ['lot-1'] })).status, 202);
    meter.reset(); assert.equal((await post(entry, { excludedOptionIds: ['lot-2'] })).status, 409);
    assert.equal(meter.stats.serializations, 0); assert.deepEqual(entry.excludedOptionIds, ['lot-1']);
  } finally { release(); await tick(); globalThis.__auctionAdmissionTest.assemble = original; meter.restore(); }
}));

test('legacy allowed IDs skip only identical derived exclusions and still exclude newly discovered lots', async () => fixture(async entry => {
  const allowed = { excludedOptionIds: undefined, excludedVariantKeys: undefined, allowedOptionIds: ['lot-1', 'lot-3'] };
  const meter = instrument();
  try {
    meter.reset(); assert.equal((await post(entry, allowed)).status, 202); assert.equal(meter.stats.serializations, 1);
    assert.deepEqual(entry.excludedOptionIds, ['lot-2']);
    meter.reset(); assert.equal((await post(entry, allowed)).status, 202); assert.equal(meter.stats.serializations, 0);
    entry.context.options.push({ id: 'lot-4', auctionId: 4, variantKey: 'synthetic', candidate: { itemId: 4 } });
    entry.knownOptionIds.add('lot-4'); store.saveAuctionGearSearch(entry);
    meter.reset(); assert.equal((await post(entry, allowed)).status, 202); assert.equal(meter.stats.serializations, 1);
    assert.deepEqual(readAuctionState('search', entry.id).data.excludedOptionIds, ['lot-2', 'lot-4']);
  } finally { meter.restore(); }
}));

for (const afterRename of [false, true]) test(`failed admission ${afterRename ? 'after rename repairs disk on an equal-selection retry' : 'before rename rolls memory back and forces an acknowledged retry'}`, async () => fixture(async entry => {
  entry.excludedOptionIds = []; entry.excludedVariantKeys = []; store.saveAuctionGearSearch(entry);
  const meter = instrument(), serialize = v8.serialize, fsync = fs.fsyncSync, write = fs.writeFileSync;
  let armed = false, failures = 0;
  v8.serialize = (...args) => { if (args[0]?.kind === 'search') armed = true; return serialize(...args); };
  const fail = () => { armed = false; failures++; const error = new Error('synthetic-EIO'); error.code = 'EIO'; throw error; };
  if (afterRename) fs.fsyncSync = fd => { if (armed && fs.fstatSync(fd).isDirectory()) fail(); return fsync(fd); };
  else fs.writeFileSync = (...args) => { if (armed) fail(); return write(...args); };
  syncBuiltinESMExports();
  try {
    try {
      const starts = taskStarts;
      meter.reset(); const rejected = await post(entry, { excludedOptionIds: ['lot-1'] });
      assert.equal(rejected.status, 503); assert.equal(rejected.body.error, 'auction_storage_unavailable'); assert.equal(failures, 1);
      assert.equal(taskStarts, starts); assert.deepEqual(entry.excludedOptionIds, []); assert.deepEqual(entry.excludedVariantKeys, []);
      assert.deepEqual(readAuctionState('search', entry.id).data.excludedOptionIds, afterRename ? ['lot-1'] : [],
        'A failed directory fsync can leave the renamed new snapshot on disk while memory has rolled back');
    } finally { v8.serialize = serialize; fs.fsyncSync = fsync; fs.writeFileSync = write; syncBuiltinESMExports(); }
    meter.reset(); assert.equal((await post(entry)).status, 202); assert.equal(meter.stats.serializations, 1,
      'Equality must not skip repair when a previous admission write had uncertain durability');
    assert.deepEqual(readAuctionState('search', entry.id).data.excludedOptionIds, []);
    meter.reset(); assert.equal((await post(entry)).status, 202); assert.equal(meter.stats.serializations, 0,
      'A successful repair clears uncertainty, so subsequent exact repetitions need no admission snapshot');
  } finally { meter.restore(); }
}));

test('mode admission keeps immutable goal, selection durability, and replay identity', async () => fixture(async entry => {
  entry.context.input.enhancementMode = 'equipment'; store.saveAuctionGearSearch(entry);
  const clientRequestId = 'mode-admission-identity-0001';
  const accepted = await post(entry, { enhancementMode: 'equipment', clientRequestId }); assert.equal(accepted.status, 202);
  assert.equal(readAuctionState('search', entry.id).data.context.input.enhancementMode, 'equipment');
  const before = taskStarts;
  assert.equal((await post(entry, { enhancementMode: 'equipment', clientRequestId })).body.id, accepted.body.id);
  assert.equal(taskStarts, before);
  assert.equal((await post(entry, { enhancementMode: 'enhanced', clientRequestId })).status, 400);
  assert.equal((await post(entry, { enhancementMode: 'enhanced', excludedOptionIds: ['lot-1'] })).status, 400);
  assert.deepEqual(entry.excludedOptionIds, []);
  assert.deepEqual(readAuctionState('search', entry.id).data.excludedOptionIds, []);
  assert.equal((await post(entry)).status, 202, 'Legacy continuation omission inherits the equipment goal');
  assert.equal(entry.context.input.enhancementMode, 'equipment');
  for (const enhancementMode of [null, '', 'quick', 'full', {}, [], true]) assert.equal((await post(entry, { enhancementMode })).status, 400);
}));

test('initial API mode reaches durable work, owned recovery intent, and idempotency without changing legacy absence', async () => {
  for (const mode of [undefined, 'equipment', 'enhanced']) await fixture(async entry => {
    const original = globalThis.__auctionAdmissionTest.start;
    let release;
    const held = new Promise(resolve => { release = resolve; });
    globalThis.__auctionAdmissionTest.start = async input => { await held; return { kind: 'search', searchId: entry.id, ...input }; };
    const request = async enhancementMode => {
      const response = await route.POST(new Request('https://gildra.example/api/wow/auction-gear-plans', { method: 'POST',
        headers: { host: 'gildra.example', origin: 'https://gildra.example' }, body: JSON.stringify({ action: 'search',
          characterSlug: 'synthetic', locale: 'en', budgetGold: '1000', selectedSlots: ['HEAD'],
          clientRequestId: 'mode-initial-identity-0001', ...(enhancementMode !== undefined ? { enhancementMode } : {}) }) }));
      return { status: response.status, body: await response.json() };
    };
    try {
      const accepted = await request(mode); assert.equal(accepted.status, 202);
      const active = getOwnerActiveAuctionGearJob(entry.owner);
      assert.equal(active.formIntent.enhancementMode, mode);
      assert.equal(Object.hasOwn(active.formIntent, 'enhancementMode'), mode !== undefined);
      assert.equal(readAuctionState('job', accepted.body.id).data.work.input.enhancementMode, mode);
      assert.equal((await request(mode)).body.id, accepted.body.id);
      assert.equal((await request(mode === 'equipment' ? 'enhanced' : 'equipment')).status, 400);
    } finally { release(); await tick(); await tick(); globalThis.__auctionAdmissionTest.start = original; }
  });
});

test('real persisted admission benchmark: identical exclusions require no second full snapshot', {
  skip: process.env.AUCTION_ADMISSION_BENCHMARK !== '1',
}, async () => {
  const rows = [];
  for (const offers of [960, 60000]) await fixture(async entry => {
    assert.equal([...entry.context.discovery.offers.values()].reduce((sum, list) => sum + list.length, 0), offers);
    entry.latestSearchResult = { kind: 'search', searchId: entry.id, pendingItems: 376,
      items: Array.from({ length: 960 }, (_, i) => ({ optionId: `synthetic-${i}`, name: `Synthetic ${i}`, itemId: 700000 + i,
        comparison: { baselineDps: 100000, candidateDps: 101000, deltaDps: 1000, deltaPercent: 1 } })) };
    entry.excludedOptionIds = []; entry.excludedVariantKeys = []; store.saveAuctionGearSearch(entry);
    const baseline = admission(beforeSource, entry), candidate = admission(currentSource, entry), meter = instrument();
    try {
      for (let repeat = 0; repeat < 5; repeat++) {
        const versions = process.env.AUCTION_ADMISSION_BASELINE_ONLY === '1' ? ['baseline'] : repeat % 2 ? ['current', 'baseline'] : ['baseline', 'current'];
        for (const version of versions) {
          meter.reset(); const started = performance.now(); (version === 'baseline' ? baseline : candidate)();
          rows.push({ offers, version, repeat, elapsedMs: performance.now() - started, ...meter.stats });
          assert.equal(meter.stats.serializations, version === 'baseline' ? 1 : 0);
          assert.equal(meter.stats.writes, version === 'baseline' ? 1 : 0); assert.equal(meter.stats.fsyncs, version === 'baseline' ? 2 : 0);
          const restored = readAuctionState('search', entry.id).data;
          assert.deepEqual(restored.excludedOptionIds, []); assert.deepEqual(restored.excludedVariantKeys, []);
          assert.equal(restored.latestSearchResult.items.length, 960);
          assert.equal([...restored.context.discovery.offers.values()].reduce((sum, list) => sum + list.length, 0), offers);
        }
      }
    } finally { meter.restore(); }
  }, offers);
  const summary = [...new Set(rows.map(row => `${row.offers}:${row.version}`))].map(key => {
    const samples = rows.filter(row => `${row.offers}:${row.version}` === key), median = field => samples.map(row => row[field]).sort((a, b) => a - b)[2];
    return { offers: samples[0].offers, version: samples[0].version, medianMs: median('elapsedMs'), medianSerializeMs: median('serializeMs'),
      serializations: samples[0].serializations, serializedBytes: samples[0].serializedBytes, writes: samples[0].writes, fsyncs: samples[0].fsyncs };
  });
  console.log(JSON.stringify({ scope: 'Actual route beforeAcceptance closure, actual SearchStore and synchronous durable checkpoint IO. Synthetic960/60000supported offers,960resultrows. Five paired repeats; not whole-path/native/production latency.', baselineCommit: '7b219512e',
    baselineHash: digest(beforeSource), currentHash: digest(currentSource), summary, rows }));
});
