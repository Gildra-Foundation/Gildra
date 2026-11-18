import assert from 'node:assert/strict';
import test from 'node:test';
import { enqueueAuctionGearJob, getAuctionGearJob, cancelAuctionGearJob, getAuctionGearJobDiagnostics } from '../../../lib/wow/auctionGearJobs.ts';

test('running publication survives progress, rejects another search, and fences cancellation', async () => {
  let hooks, release;
  const held = new Promise(resolve => { release = resolve; });
  const partial = { kind: 'search', searchId: 'publication-search' };
  const job = enqueueAuctionGearJob('publication-owner', async (_signal, progress, h) => {
    hooks = h;
    h.publishResult(partial);
    progress({ phase: 'catalog', completed: 1, total: 2 });
    await held;
    return partial;
  });
  const running = getAuctionGearJob('publication-owner', job.id);
  assert.equal(running.status, 'running');
  assert.equal(running.result.searchId, partial.searchId);
  assert.equal(running.progress.completed, 1);
  assert.throws(() => hooks.publishResult({ ...partial, searchId: 'wrong' }), /invalid_plan_request/);
  cancelAuctionGearJob('publication-owner', job.id);
  assert.throws(() => hooks.publishResult(partial), /abort/i);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(getAuctionGearJob('publication-owner', job.id).status, 'cancelled');
  const timing = getAuctionGearJobDiagnostics('publication-owner', job.id);
  assert(timing.queue >= 0 && timing.task > 0);
  assert.equal(timing.aborts, 1);
  assert.equal(timing.compute, null, 'task latency must not masquerade as native compute');
  assert.equal(getAuctionGearJobDiagnostics('other-owner', job.id), null);
});

test('a full job yields to another owner between turns and keeps its handle and reservation', async () => {
  const order = [];
  let releaseFirst, releaseOther, settled = 0;
  const first = new Promise(resolve => { releaseFirst = resolve; });
  const other = new Promise(resolve => { releaseOther = resolve; });
  const owner = 'fair-full', result = { kind: 'search', searchId: 'fair-search' };
  const job = enqueueAuctionGearJob(owner, async (_signal, _progress, hooks) => {
    order.push('first');
    await first;
    hooks.continueWith(async () => { order.push('second'); return result; });
    return result;
  }, { work: { action: 'resume', runMode: 'full', searchId: result.searchId }, onSettled: () => { settled++; } });
  enqueueAuctionGearJob('fair-quick', async () => { order.push('quick'); await other; return { ...result, searchId: 'other-search' }; });
  releaseFirst();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(getAuctionGearJob(owner, job.id).status, 'queued');
  assert.equal(settled, 0);
  assert.deepEqual(order, ['first', 'quick']);
  releaseOther();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ['first', 'quick', 'second']);
  assert.equal(getAuctionGearJob(owner, job.id).status, 'completed');
  assert.equal(settled, 1);
});
