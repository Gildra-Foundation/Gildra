/** Synthetic orchestration/cache states only; no HTTP/native work. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceAuctionGearRunPolicy as advance, auctionGearSearchRunPhase, createAuctionGearRunPolicy as create, parseAuctionGearRunPolicy as parse,
  auctionQuickSearchDurationMs, auctionQuickSearchTurns } from '../../../lib/wow/auctionGearRunPolicy.ts';
import { readAuctionClientCache, writeAuctionClientCache } from '../../../lib/wow/auctionGearClient.ts';
const search = { kind: 'search', searchComplete: false };
const assembly = { kind: 'assembly', exhaustiveComplete: false, scenarioComparisonsComplete: false, enhancementOptimization: { complete: false } };
const step = (policy, result, jobId, canAssemble = true, now = 1000) => advance(policy, result, { jobId, canAssemble, now });

test('default quick stops after three completed search turns and one assembly turn', () => {
  assert.equal(auctionQuickSearchTurns, 3); assert.equal(auctionQuickSearchDurationMs, 45000);
  let policy = create(undefined, undefined, 1000); assert.equal(policy.kind, 'quick');
  for (let n = 1; n <= 3; n++) { const next = step(policy, search, `search-${n}`); policy = next.policy; assert.equal(policy.searchTurns, n); assert.equal(next.next, n < 3 ? 'search' : 'assembly'); }
  const done = step(policy, assembly, 'assembly-1'); assert.equal(done.next, null); assert.equal(done.policy.assemblyTurns, 1);
  assert.equal(step(done.policy, assembly, 'assembly-2').next, null);
});
test('cooperative time budget is checked only after completed native work and survives recovery', () => {
  const policy = create('quick', 'search', 1000);
  assert.equal(step(policy, search, 'before-budget', true, 45999).next, 'search');
  assert.equal(step(policy, search, 'at-budget', true, 46000).next, 'assembly');
  assert.equal(step(policy, search, 'long-native-job', true, 200000).next, 'assembly');
  assert.equal(auctionGearSearchRunPhase({ ...policy, searchTurns: 2 }, false, true, 46000), 'assembly');
  assert.equal(auctionGearSearchRunPhase({ ...policy, searchTurns: 2 }, false, false, 46000), 'done');
});
test('eligible options can assemble early or in combination; empty options stop honestly', () => {
  const policy = create('quick', 'search', 1000);
  assert.equal(step(policy, { ...search, searchComplete: true }, 'done', true).next, 'assembly');
  assert.equal(step(policy, { ...search, searchComplete: true }, 'done', false).next, null);
  assert.equal(step({ ...policy, searchTurns: 2 }, search, 'third-empty', false).next, null);
  assert.equal(step(policy, { ...search, searchComplete: true, items: [{ evaluation: 'requires_combination', comparison: null }] }, 'pairs', true).next, 'assembly');
});
test('full search ignores quick bounds and waits for exhaustive, scenario and enhancement flags', () => {
  let policy = create('full', 'search', 1000);
  for (let n = 0; n < 5; n++) { const next = step(policy, search, `full-${n}`, true, 100000); assert.equal(next.next, 'search'); policy = next.policy; }
  let next = step(policy, { ...search, searchComplete: true }, 'search-complete'); assert.equal(next.next, 'assembly'); policy = next.policy;
  for (const [n, result] of [assembly, { ...assembly, exhaustiveComplete: true, enhancementOptimization: { complete: true } },
    { ...assembly, exhaustiveComplete: true, scenarioComparisonsComplete: true }].entries()) {
    next = step(policy, result, `assembly-${n}`); assert.equal(next.next, 'assembly'); policy = next.policy;
  }
  next = step(policy, { ...assembly, exhaustiveComplete: true, scenarioComparisonsComplete: true, enhancementOptimization: { complete: true } }, 'all-complete');
  assert.equal(next.next, null); assert.equal(next.policy.phase, 'done');
});
test('completed-job replay never double counts or resurrects done intent; explicit full can continue it', () => {
  let next = step(create('quick', 'search', 1000), search, 'same-search');
  assert.deepEqual(step(next.policy, search, 'same-search'), next);
  next = step(next.policy, { ...search, searchComplete: true }, 'finishing-search');
  assert.equal(step(next.policy, search, 'finishing-search').next, 'assembly'); assert.equal(next.policy.searchTurns, 2);
  const done = step(next.policy, assembly, 'last-assembly'); assert.equal(step(done.policy, search, 'old-job').next, null);
  assert.equal(step({ ...done.policy, kind: 'full', phase: 'search' }, search, 'explicit-resume').next, 'search');
  assert.equal(step(create('quick', 'assembly', 1000), assembly, 'manual-build').next, null);
});
test('full requested during quick assembly recovery finishes owned work then resumes search first', () => {
  const policy = { ...create('full', 'search', 1000), searchTurns: 3 };
  const recovered = step(policy, assembly, 'recovered-quick-assembly');
  assert.equal(recovered.next, 'search'); assert.equal(recovered.policy.assemblyTurns, 1);
  assert.deepEqual(step(recovered.policy, assembly, 'recovered-quick-assembly'), recovered);
  assert.equal(step(recovered.policy, search, 'explicit-full-resume').next, 'search');
  assert.equal(step(recovered.policy, { ...search, searchComplete: true }, 'search-finished').next, 'assembly');
});
test('policy parser whitelists bounded values and rejects malformed intent', () => {
  const policy = { ...create('full', 'search', 1000), searchTurns: 2, lastCompletedJobId: 'owned-job' };
  assert.deepEqual(parse(JSON.parse(JSON.stringify(policy))), policy);
  for (const value of [null, [], {}, { ...policy, kind: 'unbounded' }, { ...policy, phase: 'auto' }, { ...policy, searchTurns: -1 },
    { ...policy, searchTurns: 1.5 }, { ...policy, assemblyTurns: 1000001 }, { ...policy, startedAt: Infinity }, { ...policy, lastCompletedJobId: '' }]) assert.equal(parse(value), undefined);
});
test('cache restores counters/done intent; legacy or corrupt policy cannot escalate to full work', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), storage = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } });
  try {
    const cache = { version: 1, profileKey: 'fixture-profile', searchId: 'fixture-search', mode: 'search', excludedOptionIds: [] };
    writeAuctionClientCache('fixture', cache); assert.equal(readAuctionClientCache('fixture').orchestration, undefined);
    const policy = { ...create('quick', 'search', 1000), searchTurns: 2 };
    writeAuctionClientCache('fixture', { ...cache, orchestration: policy });
    assert.equal(step(readAuctionClientCache('fixture').orchestration, search, 'third-recovered').next, 'assembly');
    writeAuctionClientCache('fixture', { ...cache, orchestration: { ...policy, phase: 'done' } });
    assert.equal(step(readAuctionClientCache('fixture').orchestration, search, 'old-job').next, null);
    writeAuctionClientCache('fixture', { ...cache, orchestration: { kind: 'full', phase: 'search', searchTurns: 'invalid' } });
    assert.equal(readAuctionClientCache('fixture').orchestration, undefined);
    assert.equal(create(readAuctionClientCache('fixture').orchestration?.kind).kind, 'quick');
  } finally { if (original) Object.defineProperty(globalThis, 'sessionStorage', original); else delete globalThis.sessionStorage; }
});
