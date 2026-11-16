import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assemblyRunnerFixture, assemblySlots } from '../completion/postdeploy-assembly-support.mjs';

// Actual Runner, discovery orchestration, exhaustive Planner and effect allocator.
// Native measurements, clock and remote discovery boundary are isolated fixtures.
test('first assembly measures a whole-set seed while additional discovery is held', async () => {
  const h = await assemblyRunnerFixture({ nativeMs: 3000, discoveryMs: 15000 });
  let release;
  h.state.discoveryGate = new Promise(resolve => { release = resolve; });
  const publications = [];
  let timer;
  try {
    const result = await Promise.race([
      h.runner.assembleAuctionGearSearch(h.entry, undefined, new AbortController().signal, () => {}, 'synthetic', row => publications.push(row)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('First seed waited for discovery')), 2000); }),
    ]);
    assert.equal(h.state.pending, 1, 'No unvisited candidates are discarded or consumed');
    assert.deepEqual(new Set(h.calls[0].slots), new Set(assemblySlots), 'First new measurement evaluates the complete seed, not an isolated upgrade');
    assert(result.bestConfirmed.purchases.length >= 3);
    assert(result.bestConfirmed.spentCopper <= h.context.input.budgetCopper);
    assert.equal(result.exhaustiveComplete, false);
    assert.equal(result.discoveryComplete, false);
    assert.equal(result.searchLimited, true);
    assert(publications.some(row => row.kind === 'assembly' && row.bestConfirmed?.purchases.length >= 3));
    assert.equal(h.entry.nextAssemblyPhase, 'discovery');

    let settled = false;
    const continuation = h.step().then(value => { settled = true; return value; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false, 'Explicit continuation returns to held discovery');
    release();
    await continuation;
    assert.equal(h.state.pending, 0);
    assert.equal(h.entry.context.options.length, 8, 'Continuation retains the entire effect domain');
  } finally { clearTimeout(timer); release(); }
});

test('restored first assembly validates the worker before evaluating its seed', async () => {
  const h = await assemblyRunnerFixture({ nativeMs: 0, discoveryMs: 15000 });
  h.context.engineVerificationRequired = true;
  const result = (await h.step()).result;
  assert.equal(h.calls[0].slots.length, 0, 'Historical metadata requires a real engine-validation measurement');
  assert.equal(h.context.engineVerificationRequired, false);
  assert(h.calls.slice(1).some(call => call.slots.length >= 3));
  assert.equal(h.state.pending, 1);
  assert.equal(result.exhaustiveComplete, false);
});

test('cancellation during the first seed cannot publish an assembly or discard pending discovery', async () => {
  const h = await assemblyRunnerFixture({ discoveryMs: 15000 });
  const controller = new AbortController(), publications = [];
  const simulate = h.context.simulate;
  h.context.simulate = async selection => { controller.abort(); return simulate(selection); };
  await assert.rejects(h.runner.assembleAuctionGearSearch(h.entry, undefined, controller.signal, () => {}, 'synthetic', row => publications.push(row)), { name: 'AbortError' });
  assert.equal(h.entry.latestAssemblyResult, undefined);
  assert.equal(publications.some(row => row.kind === 'assembly'), false);
  assert.equal(h.state.pending, 1);
  assert.equal(h.entry.busy, false);
});
