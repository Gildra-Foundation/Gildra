import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { enqueueAuctionGearJob, getAuctionGearJob, cancelAuctionGearJob, waitForAuctionGearJob, validAuctionGearJobRevision } from '../../../lib/wow/auctionGearJobs.ts';
import { readAuctionState, writeAuctionState, auctionMeasurementContract } from '../../../lib/wow/auctionGearPersistence.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const result = (n = 1) => ({ kind: 'search', searchId: 'synthetic-search', items: [{ optionId: `synthetic-${n}` }], pendingItems: 3 - n });
function heldJob(owner = randomUUID()) {
  const controls = { owner };
  controls.job = enqueueAuctionGearJob(owner, (signal, progress, hooks) => new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    Object.assign(controls, { signal, progress, publish: hooks.publishResult, searchCreated: hooks.searchCreated,
      release: (value = result()) => { signal.removeEventListener('abort', aborted); resolve(value); },
      fail: error => { signal.removeEventListener('abort', aborted); reject(error); } });
  }));
  controls.current = () => getAuctionGearJob(owner, controls.job.id);
  return controls;
}
async function withJob(callback) {
  const controls = heldJob();
  try { await callback(controls); }
  finally { controls.release?.(); await tick(); }
}
async function isolated(callback) {
  assert.equal(process.env.GILDRA_AUCTION_STATE_DIR, undefined, 'Never access a live service state directory');
  const directory = await mkdtemp(join(tmpdir(), 'gildra-job-wait-'));
  process.env.GILDRA_AUCTION_STATE_DIR = directory;
  try { await callback(directory); }
  finally { delete process.env.GILDRA_AUCTION_STATE_DIR; await rm(directory, { recursive: true, force: true }); }
}
const waiting = (h, signal = new AbortController().signal) => waitForAuctionGearJob(h.owner, h.job.id, h.current().revision, signal);
const listenerCount = () => globalThis.__gildraAuctionJobWaiterCount ?? 0;

test('revision validates bounded opaque tokens and is stable between progress updates', async () => withJob(async h => {
  for (const invalid of [null, undefined, 10, '', 'x'.repeat(15), 'x'.repeat(101), 'token with spaces', 'x'.repeat(20) + '\n']) assert.equal(validAuctionGearJobRevision(invalid), false);
  for (const valid of ['x'.repeat(16), '_-'.repeat(50), h.current().revision]) assert(validAuctionGearJobRevision(valid));
  const before = h.current(); h.progress({ phase: 'simulating', completed: 1, total: 10 });
  assert.equal(h.current().revision, before.revision);
}));

test('durable publication wakes all held owners immediately with the exact result and a new revision', async () => isolated(async () => withJob(async h => {
  const before = h.current(), signals = [new AbortController(), new AbortController()];
  const waits = signals.map(signal => waiting(h, signal.signal));
  assert.equal(listenerCount(), 2);
  const published = result(2); h.publish(published);
  const responses = await Promise.all(waits);
  for (const response of responses) {
    assert.deepEqual(response.result, published); assert.notEqual(response.revision, before.revision);
    assert.equal(response.status, 'running');
  }
  const retained = readAuctionState('job', h.job.id);
  assert.deepEqual(retained.data.result, published);
  assert(!Object.hasOwn(retained.data, 'revision')); assert(!Object.hasOwn(retained.metadata, 'revision'));
  assert.equal(listenerCount(), 0);
})));

test('changing the task input after publishing cannot change what an owned revision means', async () => withJob(async h => {
  const intermediate = result(1); h.publish(intermediate);
  const before = h.current(); intermediate.items[0].optionId = 'still-being-computed';
  h.progress({ phase: 'simulating', completed: 2, total: 10 });
  const next = h.current(); assert.equal(next.revision, before.revision);
  assert.equal(next.result.items[0].optionId, 'synthetic-1'); assert.equal(next.progress.completed, 2);
}));

test('completion and failure wake a waiter, and terminal or changed revisions never hold', async () => {
  for (const failed of [false, true]) await withJob(async h => {
    const before = h.current(), promise = waiting(h);
    if (failed) h.fail(new Error('synthetic_failure')); else h.release(result(3));
    const response = await promise;
    assert.equal(response.status, failed ? 'failed' : 'completed'); assert.notEqual(response.revision, before.revision);
    assert.equal((await waitForAuctionGearJob(h.owner, h.job.id, response.revision, new AbortController().signal)).status, response.status);
  });
  await withJob(async h => {
    const before = h.current(); h.publish(result(2));
    assert.equal((await waitForAuctionGearJob(h.owner, h.job.id, before.revision, new AbortController().signal)).result.items[0].optionId, 'synthetic-2');
    assert.equal((await waitForAuctionGearJob(h.owner, h.job.id, 'unknown_revision_12345', new AbortController().signal)).id, h.job.id);
    assert.equal(listenerCount(), 0);
  });
});

test('a queued job wakes when its own running transition is persisted', async () => {
  const first = heldJob(), second = heldJob();
  try {
    assert.equal(second.current().status, 'queued');
    const before = second.current(), held = waiting(second);
    first.release(); const response = await held;
    assert.equal(response.status, 'running'); assert.notEqual(response.revision, before.revision);
  } finally { first.release(); second.release?.(); await tick(); }
});

test('progress and search identity do not wake; timeout returns latest progress after exactly5000ms', async t => isolated(async () => withJob(async h => {
  const original = fs.writeFileSync; let writes = 0, resolved = false;
  fs.writeFileSync = (...args) => { writes++; return original(...args); }; syncBuiltinESMExports();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const before = h.current(), held = waiting(h).then(value => { resolved = true; return value; });
    assert.equal(writes, 0, 'Registering a wait must not persist anything');
    h.progress({ phase: 'simulating', completed: 2, total: 8 });
    h.searchCreated('synthetic-search'); const afterIdentityWrite = writes;
    await Promise.resolve(); assert.equal(resolved, false);
    t.mock.timers.tick(4999); await Promise.resolve(); assert.equal(resolved, false);
    t.mock.timers.tick(1); const response = await held;
    assert.equal(response.progress.completed, 2); assert.equal(response.revision, before.revision);
    assert.equal(writes, afterIdentityWrite, 'Timeout must not create a persistence write');
    assert.equal(listenerCount(), 0);
  } finally { t.mock.timers.reset(); fs.writeFileSync = original; syncBuiltinESMExports(); }
})));

test('owner mismatch and unknown jobs return null without occupying listener capacity', async () => withJob(async h => {
  assert.equal(await waitForAuctionGearJob('different-owner', h.job.id, h.current().revision, new AbortController().signal), null);
  assert.equal(await waitForAuctionGearJob(h.owner, randomUUID(), h.current().revision, new AbortController().signal), null);
  assert.equal(listenerCount(), 0);
}));

test('disconnect and already-aborted requests clean listeners without cancelling the task', async () => withJob(async h => {
  const controller = new AbortController(), held = waiting(h, controller.signal), rejected = assert.rejects(held, { name: 'AbortError' });
  assert.equal(listenerCount(), 1); controller.abort(); await rejected;
  assert.equal(listenerCount(), 0); assert.equal(h.signal.aborted, false); assert.equal(h.current().status, 'running');
  await assert.rejects(waiting(h, controller.signal), { name: 'AbortError' }); assert.equal(listenerCount(), 0);
  const next = waiting(h); h.publish(result(2)); assert.equal((await next).result.items[0].optionId, 'synthetic-2');
}));

test('publication and abort at the registration boundary cannot lose a wake or leak a listener', async () => withJob(async h => {
  for (const mode of ['publish', 'abort']) {
    const controller = new AbortController(), signal = controller.signal, original = signal.addEventListener.bind(signal);
    signal.addEventListener = (...args) => { original(...args); if (mode === 'publish') h.publish(result(2)); else controller.abort(); };
    const held = waiting(h, signal);
    if (mode === 'publish') assert.equal((await held).result.items[0].optionId, 'synthetic-2');
    else await assert.rejects(held, { name: 'AbortError' });
    assert.equal(listenerCount(), 0); assert.equal(h.signal.aborted, false);
  }
}));

test('eight waiters per job are bounded and abort or publication immediately releases capacity', async () => withJob(async h => {
  const controllers = Array.from({ length: 8 }, () => new AbortController());
  const waits = controllers.map(controller => waiting(h, controller.signal).catch(error => error));
  assert.equal(listenerCount(), 8);
  await assert.rejects(waiting(h), /plan_wait_limit/);
  controllers[0].abort(); await waits[0]; assert.equal(listenerCount(), 7);
  const replacement = waiting(h); assert.equal(listenerCount(), 8);
  h.publish(result(2)); await Promise.all([...waits, replacement]); assert.equal(listenerCount(), 0);
}));

test('explicit cancellation wakes only after its durable acknowledgement', async () => isolated(async () => withJob(async h => {
  const before = h.current(), held = waiting(h);
  cancelAuctionGearJob(h.owner, h.job.id);
  const response = await held;
  assert.equal(response.status, 'cancelled'); assert.notEqual(response.revision, before.revision);
  assert.equal(readAuctionState('job', h.job.id).data.status, 'cancelled'); assert(h.signal.aborted);
})));

for (const failTerminalWrite of [false, true]) test(`failed publication ${failTerminalWrite ? 'rejects waiters when terminal durability also fails' : 'publishes failure with the prior durable result'}`, async () => isolated(async () => withJob(async h => {
  h.publish(result(1)); const before = h.current();
  const original = fs.writeFileSync; let failedWrites = 0, settled = false;
  fs.writeFileSync = (...args) => {
    if (!failedWrites++ || failTerminalWrite) { const error = new Error('synthetic-io'); error.code = 'EIO'; throw error; }
    return original(...args);
  }; syncBuiltinESMExports();
  const held = waiting(h); void held.then(() => { settled = true; }, () => { settled = true; });
  try {
    assert.throws(() => h.publish(result(2)), /auction_storage_unavailable/);
    assert.equal(h.current().revision, before.revision); assert.equal(h.current().result, before.result);
    await Promise.resolve(); assert.equal(settled, false, 'A failed result write is not a successful publication');
    h.fail(new Error('auction_storage_unavailable'));
    if (failTerminalWrite) {
      await assert.rejects(held, /auction_storage_unavailable/);
      assert.equal(h.current().revision, before.revision);
    } else {
      const failed = await held; assert.equal(failed.status, 'failed'); assert.equal(failed.result, before.result);
      assert.notEqual(failed.revision, before.revision);
    }
    assert.equal(listenerCount(), 0);
  } finally { fs.writeFileSync = original; syncBuiltinESMExports(); }
})));

test('a failed cancellation write rejects existing waits until the cancellation can be durably retried', async () => isolated(async () => withJob(async h => {
  const before = h.current(), original = fs.writeFileSync, held = waiting(h);
  const rejected = assert.rejects(held, /auction_storage_unavailable/);
  fs.writeFileSync = () => { const error = new Error('synthetic-io'); error.code = 'EIO'; throw error; }; syncBuiltinESMExports();
  try {
    assert.throws(() => cancelAuctionGearJob(h.owner, h.job.id), /auction_storage_unavailable/); await rejected;
    assert.equal(listenerCount(), 0);
  } finally { fs.writeFileSync = original; syncBuiltinESMExports(); }
  const retried = h.current(); assert.equal(retried.status, 'cancelled'); assert.notEqual(retried.revision, before.revision);
})));

function parkedRecord(index) {
  const id = randomUUID(), owner = `synthetic-parked-${index}`, now = Date.now(), expires = now + 60_000;
  const data = { id, owner, status: 'queued', progress: null, result: null, error: null, expires,
    createdAt: now, continuation: true, recency: index + 1, work: { action: 'resume', searchId: `synthetic-${index}` },
    resultMeasurementContract: auctionMeasurementContract };
  const { progress, result: ignoredResult, work, ...metadata } = data; void progress; void ignoredResult; void work;
  writeAuctionState('job', id, expires, data, { metadata: { ...metadata, hasWork: true } });
  return { id, owner };
}
test('global256 listener cap applies to recovered parked jobs and abort releases every slot', async () => isolated(async directory => {
  const records = Array.from({ length: 33 }, (_, index) => parkedRecord(index));
  const source = `
    import assert from 'node:assert/strict';
    import {getAuctionGearJob,waitForAuctionGearJob} from ${JSON.stringify(new URL('../../../lib/wow/auctionGearJobs.ts', import.meta.url).href)};
    const records=${JSON.stringify(records)}, controllers=[],waits=[];
    for(const record of records.slice(0,32))for(let i=0;i<8;i++){
      const controller=new AbortController();controllers.push(controller);
      waits.push(waitForAuctionGearJob(record.owner,record.id,getAuctionGearJob(record.owner,record.id).revision,controller.signal).catch(error=>error));
    }
    const last=records.at(-1),revision=getAuctionGearJob(last.owner,last.id).revision;
    await assert.rejects(waitForAuctionGearJob(last.owner,last.id,revision,new AbortController().signal),/plan_wait_limit/);
    assert.equal(globalThis.__gildraAuctionJobWaiterCount,256);
    controllers[0].abort();await waits[0];
    const replacement=new AbortController();waits.push(waitForAuctionGearJob(last.owner,last.id,revision,replacement.signal).catch(error=>error));
    assert.equal(globalThis.__gildraAuctionJobWaiterCount,256);
    for(const controller of controllers)controller.abort();replacement.abort();await Promise.all(waits);
    assert.equal(globalThis.__gildraAuctionJobWaiterCount,0);assert.equal(globalThis.__gildraAuctionJobWaiters.size,0);
  `;
  runChild(directory, source);
}));

function runChild(directory, source) {
  return execFileSync(process.execPath, ['--experimental-transform-types', '--no-warnings', '--import',
    new URL('../resolve.mjs', import.meta.url).href, '--input-type=module', '-e', source],
  { env: { ...process.env, GILDRA_AUCTION_STATE_DIR: directory }, encoding: 'utf8', timeout: 15_000 });
}
test('fresh-process recovery regenerates revisions and never holds on an old process token', async () => isolated(async directory => {
  const record = parkedRecord(0), jobsModule = JSON.stringify(new URL('../../../lib/wow/auctionGearJobs.ts', import.meta.url).href);
  const first = JSON.parse(runChild(directory, `import{getAuctionGearJob}from ${jobsModule};console.log(JSON.stringify(getAuctionGearJob(${JSON.stringify(record.owner)},${JSON.stringify(record.id)})));`));
  runChild(directory, `
    import assert from 'node:assert/strict';import{getAuctionGearJob,waitForAuctionGearJob}from ${jobsModule};
    const owner=${JSON.stringify(record.owner)},id=${JSON.stringify(record.id)},old=${JSON.stringify(first.revision)};
    const current=getAuctionGearJob(owner,id);assert.equal(current.id,id);assert.notEqual(current.revision,old);
    const response=await waitForAuctionGearJob(owner,id,old,new AbortController().signal);
    assert.equal(response.revision,current.revision);assert.equal(globalThis.__gildraAuctionJobWaiterCount??0,0);
  `);
  const retained = readAuctionState('job', record.id);
  assert(!Object.hasOwn(retained.data, 'revision')); assert(!Object.hasOwn(retained.metadata, 'revision'));
}));

test('a final publication followed by same-turn completion delivers one latest durable terminal view', async () => isolated(async () => withJob(async h => {
  const held = waiting(h), final = result(3);
  h.publish(final); h.release(final);
  const response = await held;
  assert.equal(response.status, 'completed', 'Do not first send the same full result as running immediately before completion');
  assert.equal(response.result, final); assert.equal(response.revision, h.current().revision);
  assert.equal(readAuctionState('job', h.job.id).data.status, 'completed'); assert.equal(listenerCount(), 0);
})));

test('multiple same-turn publications schedule one notification and the first useful result needs no timer', async () => withJob(async h => {
  const original = globalThis.setImmediate; let notifications = 0, response;
  const held = waiting(h).then(value => { response = value; return value; });
  globalThis.setImmediate = (...args) => { notifications++; return original(...args); };
  try {
    h.publish(result(1)); h.publish(result(2)); h.publish(result(3));
    assert.equal(notifications, 1); assert.equal(response, undefined);
    const delivered = await held;
    assert.equal(delivered.status, 'running', 'A later unresolved task must not hide the useful partial result');
    assert.equal(delivered.result.items[0].optionId, 'synthetic-3'); assert.equal(notifications, 1);
  } finally { globalThis.setImmediate = original; }
}));

test('disconnect clears a scheduled success notification immediately without cancelling server work', async () => withJob(async h => {
  const controller = new AbortController(), held = waiting(h, controller.signal), rejected = assert.rejects(held, { name: 'AbortError' });
  h.publish(result(2)); assert.equal(listenerCount(), 1);
  controller.abort(); assert.equal(listenerCount(), 0); await rejected;
  const privateJob = globalThis.__gildraAuctionJobs.get(h.job.id);
  assert.equal(globalThis.__gildraAuctionJobNotifications.has(privateJob), false); assert.equal(h.signal.aborted, false);
}));

test('cancellation bypasses and clears a scheduled success notification', async () => withJob(async h => {
  const held = waiting(h); h.publish(result(2));
  assert.equal(listenerCount(), 1); cancelAuctionGearJob(h.owner, h.job.id);
  assert.equal(listenerCount(), 0, 'Cancellation must release held requests synchronously');
  assert.equal((await held).status, 'cancelled');
  assert.equal(globalThis.__gildraAuctionJobNotifications.has(globalThis.__gildraAuctionJobs.get(h.job.id)), false);
}));

test('a pending successful publication cannot escape a later same-turn terminal storage failure', async () => isolated(async () => withJob(async h => {
  const held = waiting(h); h.publish(result(2)); assert.equal(listenerCount(), 1);
  const original = fs.writeFileSync;
  fs.writeFileSync = () => { const error = new Error('synthetic-io'); error.code = 'EIO'; throw error; }; syncBuiltinESMExports();
  try {
    h.fail(new Error('synthetic_failure')); await assert.rejects(held, /auction_storage_unavailable/);
    assert.equal(listenerCount(), 0);
    assert.equal(globalThis.__gildraAuctionJobNotifications.has(globalThis.__gildraAuctionJobs.get(h.job.id)), false);
  } finally { fs.writeFileSync = original; syncBuiltinESMExports(); }
})));
