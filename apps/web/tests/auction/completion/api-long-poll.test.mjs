import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as jobs from '../../../lib/wow/auctionGearJobs.ts';
import { readAuctionState } from '../../../lib/wow/auctionGearPersistence.ts';

// Actual API, Jobs and durable persistence. Only authentication is synthetic;
// tasks are controlled gates and never start a worker, network or account read.
assert.equal(process.env.GILDRA_AUCTION_STATE_DIR, undefined);
const directory = await mkdtemp(join(tmpdir(), 'gildra-api-long-poll-'));
process.env.GILDRA_AUCTION_STATE_DIR = directory;
let session = null, sequence = 0;
globalThis.__auctionLongPollAuth = () => session;
const hook = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === '@/auth') return { url: 'data:text/javascript,export async function auth(){return globalThis.__auctionLongPollAuth()}', shortCircuit: true };
  if (specifier === 'next/server') return nextResolve('next/server.js', context);
  return nextResolve(specifier, context);
} });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('unexpected_network_in_long_poll_test'); };
const route = await import('../../../app/api/wow/auction-gear-plans/route.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
const digest = value => createHash('sha256').update(value).digest('hex');
const scope = { characterSlug: 'synthetic-wait-character', locale: 'en' };
const result = index => ({ kind: 'search', searchId: `synthetic-search-${index}`, items: [], pendingItems: 37,
  searchComplete: false, simulations: 3, baseline: { dps: 1000, dpsError: .1, iterations: 750, confidence: 95,
    engine: 'SimulationCraft synthetic-long-poll' }, budgetCopper: 10000, selectedSlots: ['WRIST'] });
async function fixture(work) {
  const number = ++sequence, token = `synthetic-wait-owner-${number}`, owner = digest(`battle-net:${token}`);
  let release, hooks, workerSignal, starts = 0;
  const gate = new Promise(resolve => { release = resolve; });
  session = { battleNetAccessToken: token };
  const job = jobs.enqueueAuctionGearJob(owner, async (signal, _progress, callbacks) => {
    starts++; hooks = callbacks; workerSignal = signal; await gate; signal.throwIfAborted(); return result(number);
  }, { scope, clientRequestId: `synthetic-wait-nonce-${number}`, requestFingerprint: digest(`synthetic-request-${number}`) });
  await tick();
  const h = { owner, token, id: job.id, number, release, get hooks() { return hooks; }, get signal() { return workerSignal; },
    get starts() { return starts; }, view: () => jobs.getAuctionGearJob(owner, job.id) };
  try { return await work(h); }
  finally { release(); await tick(); jobs.cancelAuctionGearJob(owner, job.id); await tick(); session = null; }
}
async function get(query, { signal, headers = {} } = {}) {
  const response = await route.GET(new Request(`https://gildra.example/api/wow/auction-gear-plans?${new URLSearchParams(query)}`, {
    headers: { host: 'gildra.example', origin: 'https://gildra.example', ...headers }, signal,
  }));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const body = await response.json(), serialized = JSON.stringify(body);
  for (const name of ['requestFingerprint', 'clientRequestId', 'controller', 'battleNetAccessToken']) assert(!serialized.includes(name));
  return { status: response.status, body };
}
const requestFor = (h, extra = {}) => ({ id: h.id, ...scope, ...extra });

test('same-revision GET waits for a durable exact result without creating another task', async () => fixture(async h => {
  const initial = await get(requestFor(h)); assert.equal(initial.status, 200);
  assert(jobs.validAuctionGearJobRevision(initial.body.revision));
  let finished = false;
  const pending = get(requestFor(h, { after: initial.body.revision })).then(value => { finished = true; return value; });
  await tick(); assert.equal(finished, false);
  const measured = result(h.number); h.hooks.publishResult(measured);
  const delivered = await pending;
  assert.equal(delivered.status, 200); assert.equal(delivered.body.status, 'running');
  assert.notEqual(delivered.body.revision, initial.body.revision);
  assert.deepEqual(delivered.body.result, measured);
  assert.deepEqual(readAuctionState('job', h.id).data.result, measured, 'Response must follow durable publication');
  assert.equal(h.starts, 1); assert.equal(h.signal.aborted, false);
}));

test('an update committed before wait registration is returned immediately, preserving terminal results', async () => fixture(async h => {
  const initial = h.view(); h.hooks.publishResult(result(h.number));
  const changed = await get(requestFor(h, { after: initial.revision })); assert.equal(changed.status, 200);
  assert.notEqual(changed.body.revision, initial.revision); assert.deepEqual(changed.body.result, result(h.number));
  h.release(); await tick(); const complete = h.view(); assert.equal(complete.status, 'completed');
  const terminal = await get(requestFor(h, { after: complete.revision }));
  assert.equal(terminal.status, 200); assert.deepEqual(terminal.body, complete);
}));

test('HTTP abort releases its waiter without cancelling the accepted calculation', async () => fixture(async h => {
  for (let index = 0; index < 12; index++) {
    const controller = new AbortController();
    const pending = get(requestFor(h, { after: h.view().revision }), { signal: controller.signal });
    await tick(); controller.abort();
    const aborted = await pending; assert.equal(aborted.status, 503); assert.equal(aborted.body.error, 'auction_plan_unavailable');
    assert.equal(h.signal.aborted, false); assert.equal(h.view().status, 'running');
  }
  h.release(); await tick(); assert.equal(h.view().status, 'completed'); assert.equal(h.starts, 1);
}));

test('pre-aborted reads do not hold capacity, while explicit cancellation wakes a waiting read', async () => fixture(async h => {
  const cancelledRequest = new AbortController(); cancelledRequest.abort();
  const stopped = await get(requestFor(h, { after: h.view().revision }), { signal: cancelledRequest.signal });
  assert.equal(stopped.status, 503); assert.equal(h.signal.aborted, false);
  const waiting = get(requestFor(h, { after: h.view().revision })); await tick();
  jobs.cancelAuctionGearJob(h.owner, h.id);
  const cancelled = await waiting;
  assert.equal(cancelled.status, 200); assert.equal(cancelled.body.status, 'cancelled');
  assert.equal(readAuctionState('job', h.id).data.status, 'cancelled');
  assert.equal(h.signal.aborted, true);
}));

test('waiter overload is retryable and ordinary polling remains available; abort frees all slots', async () => fixture(async h => {
  const controllers = Array.from({ length: 8 }, () => new AbortController());
  const pending = controllers.map(controller => get(requestFor(h, { after: h.view().revision }), { signal: controller.signal }));
  try {
    await tick();
    const overloaded = await get(requestFor(h, { after: h.view().revision }));
    assert.equal(overloaded.status, 429); assert.equal(overloaded.body.error, 'plan_wait_limit');
    assert.equal((await get(requestFor(h))).status, 200);
  } finally { for (const controller of controllers) controller.abort(); await Promise.all(pending); }
  const controller = new AbortController(), recovered = get(requestFor(h, { after: h.view().revision }), { signal: controller.signal });
  await tick(); h.hooks.publishResult(result(h.number)); assert.equal((await recovered).status, 200);
  assert.equal(h.signal.aborted, false);
}));

test('long polling keeps same-origin, authentication, owner and character-locale boundaries', async () => fixture(async h => {
  const query = requestFor(h, { after: h.view().revision });
  assert.equal((await get(query, { headers: { origin: 'https://foreign.example' } })).status, 403);
  assert.equal((await get(query, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  session = null; assert.equal((await get(query)).status, 401);
  session = { battleNetAccessToken: 'synthetic-foreign-wait-owner' };
  assert.equal((await get(query)).status, 404);
  session = { battleNetAccessToken: h.token };
  for (const changed of [{ characterSlug: 'other-character' }, { locale: 'ru' }, { id: 'missing-job' }]) {
    const response = await get({ ...query, ...changed }); assert.equal(response.status, 404); assert.equal(response.body.error, 'plan_not_found');
  }
  assert.equal(h.starts, 1); assert.equal(h.signal.aborted, false);
}));

test('after is bounded, singular and only accepted for the explicit job-id read', async () => fixture(async h => {
  const revision = h.view().revision;
  const malformed = [
    ...['', 'short', 'x'.repeat(101), 'a'.repeat(16)+'/', ' '.repeat(16)].map(after => requestFor(h, { after })),
    { after: revision }, { active: '1', after: revision },
    { clientRequestId: `synthetic-wait-nonce-${h.number}`, ...scope, after: revision },
    { searchId: 'synthetic-search', ...scope, after: revision },
    [['id', h.id], ['after', revision], ['after', revision]],
    [['id', h.id], ['id', h.id], ['after', revision]],
  ];
  for (const query of malformed) {
    const response = await get(query); assert.equal(response.status, 400, JSON.stringify(query));
    assert.equal(response.body.error, 'invalid_plan_request');
  }
  assert.equal(h.starts, 1); assert.equal(h.signal.aborted, false);
}));

test('unknown valid revisions and ordinary nonce recovery remain compatible with immediate polling', async () => fixture(async h => {
  const response = await get(requestFor(h, { after: 'unknown-revision-0000' }));
  assert.equal(response.status, 200); assert.deepEqual(response.body, h.view());
  const recovered = await get({ clientRequestId: `synthetic-wait-nonce-${h.number}`, ...scope });
  assert.equal(recovered.status, 200); assert.equal(recovered.body.id, h.id); assert.equal(recovered.body.revision, h.view().revision);
  assert.equal(h.starts, 1); assert.equal(h.signal.aborted, false);
}));

after(async () => {
  hook.deregister(); globalThis.fetch = originalFetch; delete globalThis.__auctionLongPollAuth;
  delete process.env.GILDRA_AUCTION_STATE_DIR; await rm(directory, { recursive: true, force: true });
});
