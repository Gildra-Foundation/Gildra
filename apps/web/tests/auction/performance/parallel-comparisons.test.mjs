import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleAuctionGear, searchAuctionGearOptions } from '../../../lib/wow/auctionGearPlanner.ts';

const measurement = dps => ({ dps, dpsError: 1.125, confidence: 95, iterations: 750, engine: 'SimulationCraft parallel-fixture' });
const baseline = measurement(1000.125);
const option = (index, effect = index) => ({ id: `lot-${index}`, auctionId: index + 1, quantity: 1, costCopper: 100 + index,
  variantKey: 'exact', candidate: { itemId: 900000 + effect, name: 'Synthetic wrist', slotType: 'WRIST', inventoryType: 9,
    itemClassId: 4, itemSubclassId: 4, eligible: true, constraints: { uniqueEquipped: false }, compatibility: { specId: 72 },
    variants: [{ key: 'exact', itemLevel: 300, bonusIds: [effect + 1] }] } });
const input = overrides => ({ searchId: 'parallel-fixture', budgetCopper: 100000, options: Array.from({ length: 8 }, (_, i) => option(i)),
  selectedSlots: ['WRIST'], loadout: [], specId: 72, market: { sourceUpdatedAt: new Date().toISOString() },
  signal: new AbortController().signal, baseline, maxNewSimulations: 8, simulationConcurrency: 2, ...overrides });
const score = selected => measurement(1100.125 + selected[0].candidate.itemId - 900000);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('two independent comparisons overlap, remain bounded and preserve every serial result', async () => {
  let active = 0, peak = 0, calls = 0;
  const entered = deferred(), held = deferred();
  const pending = searchAuctionGearOptions(input({ simulationBatchSize: 0, simulate: async selected => {
    calls++; active++; peak = Math.max(peak, active); if (active === 2) entered.resolve();
    await held.promise; active--; return score(selected);
  } }));
  await entered.promise;
  assert.equal(calls, 2);
  held.resolve();
  const parallel = await pending;
  const serial = await searchAuctionGearOptions(input({ simulationConcurrency: 1, simulate: async selected => score(selected) }));
  assert.equal(peak, 2); assert.equal(active, 0); assert.equal(calls, 8);
  assert.deepEqual(parallel, serial);
});

test('equivalent lots share work and both simulation and assignment budgets remain exact', async () => {
  for (const maxNewSimulations of [1, 2, 3]) for (const maxAssignments of [1, 2, 4, 8]) {
    const calls = [];
    const result = await searchAuctionGearOptions(input({ options: [option(0), option(1, 0), option(2), option(3)], maxNewSimulations, maxAssignments,
      simulate: async selected => { calls.push(selected[0].candidate.itemId); return score(selected); } }));
    assert.equal(new Set(calls).size, calls.length);
    assert(calls.length <= maxNewSimulations); assert(result.checkpoint.nextOption <= maxAssignments);
    if (maxAssignments === 1) assert.deepEqual(calls, [900000]);
  }
});

test('successful sibling survives failure; resume retries only the missing effect', async () => {
  let saved; const failure = new Error('native failure');
  await assert.rejects(searchAuctionGearOptions(input({ options: [option(0), option(1)], onCheckpoint: checkpoint => { saved = structuredClone(checkpoint); },
    simulate: async selected => { if (selected[0].candidate.itemId === 900001) { await new Promise(resolve => setImmediate(resolve)); throw failure; } return score(selected); },
  })), error => error === failure);
  assert.equal(saved.nextOption, 0); assert.equal(saved.simulations, 1);
  const calls = [];
  const resumed = await searchAuctionGearOptions(input({ options: [option(0), option(1)], checkpoint: saved,
    simulate: async selected => { calls.push(selected[0].candidate.itemId); return score(selected); } }));
  assert.deepEqual(calls, [900001]); assert.equal(resumed.result.searchComplete, true); assert.equal(resumed.checkpoint.simulations, 2);
});

test('failure aborts and drains its sibling before returning the original error', async () => {
  const failure = new Error('native rejected'); let drained = false;
  await assert.rejects(searchAuctionGearOptions(input({ simulate: async (selected, signal) => {
    if (selected[0].candidate.itemId === 900000) { await new Promise(resolve => setImmediate(resolve)); throw failure; }
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    drained = true; signal.throwIfAborted();
  } })), error => error === failure);
  assert.equal(drained, true);
});

test('external cancellation drains both requests without committing the cancelled pair', async () => {
  const controller = new AbortController(), entered = deferred(); let started = 0, drained = 0, saved;
  const pending = searchAuctionGearOptions(input({ signal: controller.signal, onCheckpoint: checkpoint => { saved = structuredClone(checkpoint); },
    simulate: async (_, signal) => {
      if (++started === 2) entered.resolve();
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      drained++; signal.throwIfAborted();
    } }));
  await entered.promise; controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(drained, 2); assert.equal(saved.nextOption, 0); assert.equal(saved.simulations, 0);
});

test('cooperative deadline retains both completed measurements for continuation', async () => {
  let stop = false, saved;
  const first = await searchAuctionGearOptions(input({ shouldYield: () => stop, onCheckpoint: checkpoint => { saved = structuredClone(checkpoint); },
    simulate: async selected => { stop = true; return score(selected); } }));
  assert.equal(first.checkpoint.simulations, 2); assert.equal(first.checkpoint.nextOption, 1);
  const calls = [];
  const resumed = await searchAuctionGearOptions(input({ checkpoint: saved, simulate: async selected => { calls.push(selected[0].candidate.itemId); return score(selected); } }));
  assert.deepEqual(calls, [900002, 900003, 900004, 900005, 900006, 900007]);
  assert.equal(resumed.result.searchComplete, true);
});

test('full assembly prepares distinct effects during the first calculation and commits the serial ranking', async () => {
  const held = deferred(), ready = deferred();
  let outstanding = 0;
  const base = input({simulationBatchSize: 3});
  const pending = assembleAuctionGear({...base, simulate: async selected => {
    if (++outstanding === 6) ready.resolve();
    await held.promise;
    return score(selected);
  }});
  await ready.promise;
  assert.equal(outstanding, 6);
  held.resolve();
  const result = await pending;
  const serial = await assembleAuctionGear({...base, simulationBatchSize: undefined, simulate: async selected => score(selected)});
  assert.deepEqual(result, serial);
});

test('assembly batch failure preserves completed measurements without advancing past the failed assignment', async () => {
  const base = input({simulationBatchSize: 3});
  let saved;
  await assert.rejects(assembleAuctionGear({...base, onCheckpoint: c => { saved = structuredClone(c); },
    simulate: async selected => {
      if (selected[0].candidate.itemId === 900002) {
        await new Promise(resolve => setImmediate(resolve));
        throw Error('interrupted calculation');
      }
      return score(selected);
    }}), /interrupted calculation/);
  const measured = saved.simulations;
  assert(measured > 0);
  let calls = 0;
  const resumed = await assembleAuctionGear({...base, checkpoint: saved, simulate: async selected => {
    calls++; return score(selected);
  }});
  const serial = await assembleAuctionGear({...base, simulationBatchSize: undefined, simulate: async selected => score(selected)});
  assert.equal(calls + measured, serial.checkpoint.simulations);
  assert.deepEqual(resumed, serial);
});
