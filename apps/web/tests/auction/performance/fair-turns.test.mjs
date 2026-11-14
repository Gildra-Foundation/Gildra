import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { createAuctionGearDiagnostics, logAuctionGearDiagnostics } from '../../../lib/wow/auctionGearDiagnostics.ts';

test('slow discovery gives recovered next turn to simulation and persists on cancellation', async () => {
  const source = await readFile(new URL('../../../lib/wow/auctionGearRunner.ts', import.meta.url), 'utf8');
  const functionSource = source.slice(source.indexOf('export async function continueAuctionGearSearch('), source.indexOf('/** Refresh actual character'));
  let now = 0, discoveryCalls = 0, simulations = 0, flushes = 0;
  const result = { kind: 'search', searchId: 'test', pendingItems: 0, items: [] };
  const run = vm.runInNewContext(stripTypeScriptTypes(functionSource).replace('export ', '') + ';continueAuctionGearSearch', {
    logAuctionGearDiagnostics, comparedOptions: new WeakMap(), metricsFor: () => createAuctionGearDiagnostics(),
    Date: { now: () => now }, publicAuctionResult: (_context, r) => r,
    flushAuctionGearSearch: async () => { flushes++; },
    discoverAuctionOptions: async entry => { discoveryCalls++; entry.context.options = [{}]; now += 11000; },
    updateAuctionSearchResult: async (entry, signal, _progress, yieldNow) => {
      signal.throwIfAborted();
      if (!yieldNow()) simulations++;
      entry.latestSearchResult = result;
      return result;
    },
  });
  const entry = { context: { options: [] } };
  await run(entry, new AbortController().signal, () => {}, 'token');
  assert.equal(simulations, 0);
  assert.equal(entry.nextSearchPhase, 'simulation');
  const restored = structuredClone(entry), publications = [];
  await run(restored, new AbortController().signal, () => {}, 'token', r => publications.push(r));
  assert.equal(simulations, 1, 'comparison gets a turn before another slow discovery');
  assert.equal(discoveryCalls, 2);
  assert.equal(publications.length, 2);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(run(restored, controller.signal, () => {}, 'token'), /abort/i);
  assert.equal(restored.busy, false);
  assert.equal(flushes, 4);
});

test('initial comparison publishes before a subsequent comparison settles', async () => {
  const source = await readFile(new URL('../../../lib/wow/auctionGearRunner.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export async function continueAuctionGearSearch('), source.indexOf('/** Refresh actual character'));
  let calls = 0, release, publishedResolve;
  const held = new Promise(resolve => { release = resolve; });
  const published = new Promise(resolve => { publishedResolve = resolve; });
  const run = vm.runInNewContext(stripTypeScriptTypes(body).replace('export ', '') + ';continueAuctionGearSearch', {
    logAuctionGearDiagnostics, comparedOptions: new WeakMap(), metricsFor: () => createAuctionGearDiagnostics(),
    Date, publicAuctionResult: (_context, r) => r, flushAuctionGearSearch: async () => {},
    discoverAuctionOptions: async () => {},
    updateAuctionSearchResult: async (_entry, _signal, _progress, _yield, limit) => {
      assert.equal(limit, 1);
      calls++;
      if (calls === 2) await held;
      return { searchId: 'first', pendingItems: calls < 2 ? 1 : 0, items: [{ comparison: { candidateDps: 10 } }] };
    },
  });
  const pending = run({ context: { options: [{}] } }, new AbortController().signal, () => {}, 'token', publishedResolve);
  const first = await published;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(first.items[0].comparison.candidateDps, 10);
  assert.equal(calls, 2, 'subsequent comparison is still pending');
  release(); await pending;
});
