import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { searchAuctionGearOptions } from '../../../lib/wow/auctionGearPlanner.ts';

const source = readFileSync(new URL('../../../lib/wow/auctionGearRunner.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source.slice(source.indexOf('function createAuctionSimulator(')));
function bridge(fetch) {
  const create = new vm.Script(code + '\n;createAuctionSimulator').runInNewContext({
    fetch, AbortSignal, process, metricsFor: () => ({}), auctionGearProfileFingerprint: () => 'fixture',
  });
  return create({ armory: {}, engine: () => 'SimulationCraft capacity-test' });
}
const wire = capacity => Response.json({ status: 'ok' }, { headers: capacity === null ? {} : { 'x-gildra-simulation-concurrency': capacity } });

test('capacity is queried live and only an explicit successful two permits enables overlap', async () => {
  for (const capacity of [null, '1', '2', '8', 'invalid']) {
    const run = bridge(async (url, request) => {
      assert.equal(new URL(url).pathname, '/healthz'); assert.equal(request.cache, 'no-store'); return wire(capacity);
    });
    assert.equal(await run.concurrency(new AbortController().signal), capacity === '2' ? 2 : 1);
  }
  for (const fetch of [async () => { throw Error('unavailable'); }, async () => new Response('', { status: 503, headers: { 'x-gildra-simulation-concurrency': '2' } })]) {
    assert.equal(await bridge(fetch).concurrency(new AbortController().signal), 1);
  }
});

test('capacity probing propagates cancellation rather than scheduling fallback work', async () => {
  const controller = new AbortController(); let calls = 0;
  const run = bridge(async () => { calls++; controller.abort(); throw Error('transport aborted'); });
  await assert.rejects(run.concurrency(controller.signal), { name: 'AbortError' });
  await assert.rejects(run.concurrency(controller.signal), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('a warm search survives worker downgrade from two permits to legacy one without restoring its checkpoint', async () => {
  let capacity = 2, active = 0, peak = 0;
  const run = bridge(async () => wire(capacity === 2 ? '2' : null));
  const baseline = { dps: 1000, dpsError: 1, iterations: 750, confidence: 95, engine: 'SimulationCraft capacity-test' };
  const options = Array.from({ length: 4 }, (_, i) => ({ id: String(i), auctionId: i + 1, quantity: 1, costCopper: 100,
    variantKey: 'v', candidate: { itemId: i + 100, name: 'Synthetic wrist', slotType: 'WRIST', inventoryType: 9, itemClassId: 4,
      itemSubclassId: 4, eligible: true, constraints: {}, compatibility: { specId: 72 }, variants: [{ key: 'v', bonusIds: [] }] } }));
  const input = { searchId: 'warm', budgetCopper: 1000, options, selectedSlots: ['WRIST'], loadout: [], specId: 72,
    baseline, signal: new AbortController().signal, market: { sourceUpdatedAt: new Date().toISOString() }, maxNewSimulations: 2,
    simulate: async selected => {
      active++; peak = Math.max(peak, active);
      assert(active <= capacity, 'Legacy worker cannot accept a stale pair');
      await new Promise(resolve => setImmediate(resolve)); active--;
      return { ...baseline, dps: 1100 + selected[0].candidate.itemId };
    } };
  const first = await searchAuctionGearOptions({ ...input, simulationConcurrency: await run.concurrency(input.signal) });
  assert.equal(peak, 2); assert.equal(first.result.searchComplete, false);
  capacity = 1; peak = 0;
  const resumed = await searchAuctionGearOptions({ ...input, checkpoint: first.checkpoint, simulationConcurrency: await run.concurrency(input.signal) });
  assert.equal(peak, 1); assert.equal(resumed.result.searchComplete, true); assert.equal(resumed.checkpoint.simulations, 4);
});
