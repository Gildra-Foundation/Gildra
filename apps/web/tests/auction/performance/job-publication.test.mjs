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
