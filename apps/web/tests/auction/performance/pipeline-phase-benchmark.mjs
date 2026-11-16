/** Controlled full client→Jobs→Runner→Planner flow. No account, HTTP service or native process.
 * Run from apps/web with the usual auction resolver and --experimental-transform-types.
 * `baseline` reads frozen production sources in work/gear-planner/pipeline-baseline.
 * This measures real orchestration/durability with explicitly synthetic upstream/native latency;
 * it is neither browser paint time nor a production/native throughput claim. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import v8 from 'node:v8';
import * as client from '../../../lib/wow/auctionGearClient.ts';
import * as policy from '../../../lib/wow/auctionGearRunPolicy.ts';
import * as store from '../../../lib/wow/auctionGearSearchStore.ts';
import * as jobs from '../../../lib/wow/auctionGearJobs.ts';
import * as persistence from '../../../lib/wow/auctionGearPersistence.ts';
import { auctionGearPricesAreFresh } from '../../../lib/wow/auctionGearFreshness.ts';
import { auctionGearVariantSelectionKey } from '../../../lib/wow/auctionGearExclusions.ts';
import { auctionGearResultMatchesIntent } from '../../../lib/wow/auctionGearResult.ts';
import { encodeAuctionGearSelectionTransport } from '../../../lib/wow/auctionGearSelectionTransport.ts';
import { parseAuctionGearSlots } from '../../../lib/wow/auctionGearSelection.ts';
import { harness, strip, record, offer, character } from '../completion/priority-feedback-harness.mjs';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const version = process.argv[2] ?? 'current';
const label = process.env.AUCTION_PIPELINE_LABEL ?? 'controlled-fast';
assert(['baseline', 'current'].includes(version));
const repeats = Number(process.env.AUCTION_PIPELINE_REPEATS ?? 3);
const delays = { clientRttMs: 10, healthMs: Number(process.env.AUCTION_PIPELINE_HEALTH_MS ?? 25), nativeMs: Number(process.env.AUCTION_PIPELINE_NATIVE_MS ?? 80), metadataMs: 15, ownershipMs: 15, armoryMs: 25, marketMs: 25 };
const baselineRef = process.env.AUCTION_PIPELINE_BASELINE_REF ?? 'e6edaa47985e8a689ca29bf706f626fa313a52e1';
const gitSource = (file, location) => {
  try { return execFileSync('git', ['show', `${baselineRef}:${location}/${file}`], { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); }
  catch { throw new Error(`Baseline ${baselineRef} is unavailable locally; provide AUCTION_PIPELINE_BASELINE_REF. This benchmark never fetches Git history.`); }
};
const readSource = async (file, location) => version === 'baseline' ? gitSource(file, location) : readFile(path.join(root, location, file), 'utf8');
const sharedImports = {};
for (const file of ['auctionGearPersistence.ts','auctionGearJobs.ts','auctionGearClient.ts','auctionGearRunPolicy.ts']) {
  const actual = await readFile(path.join(root,'apps/web/lib/wow',file),'utf8');
  assert.equal(actual, gitSource(file,'apps/web/lib/wow'), `${file} changed: bind its frozen implementation before comparing whole-path timings`);
  sharedImports[file] = createHash('sha256').update(actual).digest('hex');
}
const sources = {
  runner: await readSource('auctionGearRunner.ts', 'apps/web/lib/wow'),
  discovery: await readSource('auctionGearDiscovery.ts', 'apps/web/lib/wow'),
  component: await readSource('AuctionGearOptimizer.tsx', 'apps/web/components/wow/audit'),
  store: await readSource('auctionGearSearchStore.ts', 'apps/web/lib/wow'),
};
const sourceHashes = Object.fromEntries(Object.entries(sources).map(([key, value]) => [key, createHash('sha256').update(value).digest('hex')]));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const since = began => performance.now() - began;
const originalFetch = globalThis.fetch, originalSerialize = v8.serialize;
assert.equal(process.env.GILDRA_AUCTION_STATE_DIR, undefined, 'Never benchmark against service checkpoints');
const directory = await mkdtemp(path.join(tmpdir(), 'gildra-pipeline-benchmark-'));
process.env.GILDRA_AUCTION_STATE_DIR = directory;
const storage = new Map();
globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
let serialization;
v8.serialize = (...args) => { const began = performance.now(), bytes = originalSerialize(...args); if (serialization) { serialization.calls++; serialization.bytes += bytes.length; serialization.ms += since(began); } return bytes; };
syncBuiltinESMExports();

async function benchmark(kind, repeat) {
  storage.clear();
  const began = performance.now(), phases = {}, turns = [], requests = [];
  serialization = { calls: 0, bytes: 0, ms: 0 };
  const serializeCounts = serialization;
  const timed = async (name, work) => {
    const start = performance.now(), row = phases[name] ??= { calls: 0, totalMs: 0 }; row.calls++;
    try { return await work(); } finally { row.totalMs += since(start); }
  };
  const itemIds = Array.from({ length: 24 }, (_, i) => 90000 + i);
  const fixture = await harness({ entities: itemIds.map(id => record(id)), offers: itemIds.map((id, i) => ({ ...offer(1, i + 1), itemId: id })) });
  fixture.state.measure = input => 1000 + (input.gearChanges ?? []).reduce((sum, change) => sum + (change.itemId - 89999) * 10, 0);
  const runnerBindings = await fixture.runner.continueAuctionGearSearch.constructor('return globalThis')();
  const discoveryBindings = await fixture.discovery.advanceAuctionGearDiscovery.constructor('return globalThis')();
  const storeExports = [...sources.store.matchAll(/^export (?:async )?function (\w+)/gm)].map(match => match[1]);
  const selectedStore = version === 'current' ? store : new vm.Script(strip(sources.store) + '\n;({' + storeExports.join(',') + '})').runInNewContext({
    ...persistence, randomUUID, process, Map, Set, WeakMap, Date, Object, JSON, Number, setTimeout, clearTimeout,
    snapshotAuctionGearContext: runnerBindings.snapshotAuctionGearContext, restoreAuctionGearContext: runnerBindings.restoreAuctionGearContext,
    getActiveAuctionGearJob: jobs.getActiveAuctionGearJob,
  });

  const discovery = new vm.Script(strip(sources.discovery) + '\n;({createAuctionGearDiscovery,advanceAuctionGearDiscovery,refreshAuctionGearDiscovery,auctionGearDiscoveryCoverage,auctionGearDiscoveryOptions})').runInNewContext({ ...discoveryBindings,
    resolveAuctionVariants: async input => timed('metadata', async () => { await pause(delays.metadataMs); return discoveryBindings.resolveAuctionVariants(input); }),
  });
  const runner = new vm.Script(strip(sources.runner) + '\n;({startAuctionGearSearch,continueAuctionGearSearch,verifyAuctionGearSearch,assembleAuctionGearSearch,auctionGearRunDiagnostics})').runInNewContext({ ...runnerBindings, ...discovery, ...selectedStore,
    getBattleNetCharacterBySlug: async () => timed('ownership', async () => { await pause(delays.ownershipMs); return character; }),
    getBattleNetSimulationSnapshot: async (...args) => timed('armory', async () => { await pause(delays.armoryMs); return runnerBindings.getBattleNetSimulationSnapshot(...args); }),
    getCharacterAuctionMarket: async (...args) => timed('market', async () => { await pause(delays.marketMs); return runnerBindings.getCharacterAuctionMarket(...args); }),
    flushAuctionGearSearch: async entry => timed('searchDurableFlush', () => selectedStore.flushAuctionGearSearch(entry)),
    fetch: async (url, options) => {
      const health = new URL(url).pathname === '/healthz';
      return timed(health ? 'health' : 'nativeFixture', async () => {
        await pause(health ? delays.healthMs : delays.nativeMs); options?.signal?.throwIfAborted();
        return runnerBindings.fetch(url, options);
      });
    },
  });
  const owner = `pipeline-${kind}-${repeat}-${randomUUID()}`;
  const wire = (payload, status = 200) => { const response = Response.json(payload, { status }), parse = response.json.bind(response); response.json = async () => { const value = await parse(); if(value.status === 'completed') { const turn=turns.find(turn=>turn.id===value.id); if(turn)turn.clientObservedCompletedMs ??= since(began); } return value; }; return response; };
  const input = { characterSlug: 'synthetic', budgetCopper: 1000, selectedSlots: ['WRIST'], objective: 'value', scenario: 'single-target', locale: 'en' };
  let firstServerComparisonMs = null, firstClientComparisonMs = null, firstServerLoadoutMs = null, firstClientLoadoutMs = null, firstServerCandidate, firstClientCandidate, entry;
  const candidate = result => { const row=result.items.find(item=>item.comparison); return row && [row.itemId,row.variantKey,row.comparison.baselineDps,row.comparison.candidateDps,row.comparison.uncertainty.marginDps]; };
  globalThis.fetch = async (url, options = {}) => {
    const sentAtMs = since(began), target = new URL(url, 'http://synthetic.invalid');
    assert.equal(target.pathname, '/api/wow/auction-gear-plans');
    await pause(delays.clientRttMs / 2);
    if ((options.method ?? 'GET') === 'GET') {
      const payload = jobs.getAuctionGearJob(owner, target.searchParams.get('id'));
      assert(payload); requests.push({ method: 'GET', atMs: since(began), id: payload.id, status: payload.status });
      await pause(delays.clientRttMs / 2); return wire(payload);
    }
    if (options.method === 'DELETE') { jobs.cancelAuctionGearJob(owner, target.searchParams.get('id')); return Response.json({ ok: true }); }
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body), action = body.action;
    assert(['search', 'resume', 'assemble'].includes(action));
    const turn = { action, postSentMs: sentAtMs, requestAtMs: since(began), publications: [] }; turns.push(turn); requests.push({ method: 'POST', action, atMs: turn.requestAtMs });
    entry = action === 'search' ? undefined : selectedStore.getAuctionGearSearch(owner, body.searchId);
    const release = entry ? selectedStore.reserveAuctionGearSearch(entry) : undefined;
    const selection = { excludedOptionIds: body.excludedOptionIds ?? [], excludedVariantKeys: body.excludedVariantKeys ?? [] };
    const job = jobs.enqueueAuctionGearJob(owner, async (signal, progress, hooks) => {
      turn.taskStartMs = since(began);
      const publishResult = result => {
        hooks.publishResult(result); const atMs = since(began); turn.publications.push({ atMs, kind: result.kind });
        if (result.kind === 'search' && result.items.some(item => item.comparison)) { firstServerComparisonMs ??= atMs; firstServerCandidate ??= candidate(result); }
        if (result.kind === 'assembly') firstServerLoadoutMs ??= atMs;
      };
      try {
        if (action === 'search') return await runner.startAuctionGearSearch(input, owner, 'synthetic-private-token', signal, progress, hooks.searchCreated, publishResult);
        await timed('verification', () => runner.verifyAuctionGearSearch(entry, 'synthetic-private-token', signal));
        return action === 'resume' ? await runner.continueAuctionGearSearch(entry, signal, progress, 'synthetic-private-token', publishResult)
          : await runner.assembleAuctionGearSearch(entry, selection, signal, progress, 'synthetic-private-token', publishResult);
      } catch (error) { console.error(JSON.stringify({ fixtureAction: action, error: String(error), stack: error?.stack })); throw error; } finally { turn.taskEndMs = since(began); }
    }, { continuation: action !== 'search', scope: { characterSlug: 'synthetic', locale: 'en' }, ...(entry ? { searchId: entry.id } : {}), onSettled: () => { release?.(); turn.serverCompletedMs = since(began); },
      work: action === 'search' ? { action, input } : action === 'resume' ? { action, searchId: entry.id } : { action, searchId: entry.id, selection } });
    turn.id = job.id;
    await pause(delays.clientRttMs / 2); return wire(job, 202);
  };
  const cache = { current: { version: 1, profileKey: 'synthetic-snapshot', mode: 'search', excludedOptionIds: [], orchestration: policy.createAuctionGearRunPolicy(kind) } };
  const active = { current: null }, resultState = {}, scopeAlive = { current: true };
  const observe = (type, value) => {
    resultState[type] = value; const atMs = since(began);
    if (type === 'search' && value.items.some(item => item.comparison)) { firstClientComparisonMs ??= atMs; firstClientCandidate ??= candidate(value); }
    if (type === 'assembly') firstClientLoadoutMs ??= atMs;
  };
  const noOp = () => {};
  const runBody = sources.component.slice(sources.component.indexOf('  async function run(initial:'), sources.component.indexOf('  useEffect(() => { runRef.current = run;'));
  const run = new vm.Script(stripTypeScriptTypes(runBody) + '\n;run').runInNewContext({ ...client, ...policy,
    active, cache, scopeAlive, mountGeneration: { current: 0 }, snapshotKey: 'synthetic-snapshot', characterSlug: 'synthetic', locale: 'en', crypto: { randomUUID },
    AbortController, AbortSignal, Map, Set, JSON, Error, fetch: (...args) => globalThis.fetch(...args), encodeAuctionGearSelectionTransport,
    jobIsActive: job => job.status === 'queued' || job.status === 'running', auctionGearPricesAreFresh, auctionGearVariantSelectionKey, parseAuctionGearSlots,
    intentMatchesSearch: auctionGearResultMatchesIntent, remember: update => { cache.current = { ...cache.current, ...update }; },
    setTransport: value => { resultState.transport = typeof value === 'function' ? value(resultState.transport) : value; },
    setSearch: value => observe('search', value), setAssembly: value => observe('assembly', value),
    setAssemblyStale: noOp, setMarketStale: noOp, setRetryJob: noOp, setHasRecovery: noOp, setCancellation: noOp,
    setOwnerLookupFailed: noOp, setDiscovered: noOp, setExcluded: noOp, setExcludedVariantKeys: noOp, setBudget: noOp, restoreEncounter: noOp,
    setObjective: noOp, setSelectedSlots: noOp,
    auctionClientDelay: async (ms, signal) => timed('clientPollSleep', () => client.auctionClientDelay(ms, signal)),
  });
  await run({ action: 'search', characterSlug: 'synthetic', budgetGold: '0.1', selectedSlots: ['WRIST'], scenario: 'single-target', objective: 'value', locale: 'en' }, 'search');
  const totalMs = since(began);
  assert.equal(resultState.transport.status, 'completed', JSON.stringify({transport:resultState.transport,requests,turns}));
  assert.equal(cache.current.orchestration.phase, 'done');
  entry = selectedStore.getAuctionGearSearch(owner, cache.current.searchId); assert(entry);
  assert(resultState.assembly); assert(firstServerComparisonMs !== null && firstClientComparisonMs !== null);
  for (const request of fixture.state.simulationRequests) assert.equal(request.actionListMode, 'native');
  for (const turn of turns) turn.jobsDiagnostics = jobs.getAuctionGearJobDiagnostics(owner, turn.id);
  const interJobGaps = turns.slice(1).map((turn, i) => turn.postSentMs - turns[i].serverCompletedMs);
  const completedDeliveryTails = turns.map(turn => turn.clientObservedCompletedMs - turn.serverCompletedMs);
  const clientContinuationDispatchMs = turns.slice(1).map((turn,i)=>turn.postSentMs-turns[i].clientObservedCompletedMs);
  const result = { version, kind, repeat, totalMs, firstServerCandidate, firstClientCandidate, firstServerComparisonMs, firstClientComparisonMs, firstServerLoadoutMs, firstClientLoadoutMs,
    firstComparisonDeliveryLagMs: firstClientComparisonMs - firstServerComparisonMs,
    phases, serialization: { ...serializeCounts }, postCount: turns.length, pollCount: requests.filter(row => row.method === 'GET').length,
    interJobGaps, completedDeliveryTails, clientContinuationDispatchMs,
    fixtureSetupBeforePostMs: turns[0].postSentMs, postToDoneMs: totalMs - turns[0].postSentMs,
    postToFirstComparisonMs: firstClientComparisonMs - turns[0].postSentMs, postToFirstLoadoutMs: firstClientLoadoutMs - turns[0].postSentMs, turns, requests, orchestration: cache.current.orchestration, runnerDiagnostics: runner.auctionGearRunDiagnostics(entry),
    verifiedItems: entry.latestSearchResult.items.filter(item => item.comparison).length, offeredItems: entry.latestSearchResult.items.length,
    exhaustiveComplete: entry.latestAssemblyResult.exhaustiveComplete,
    finalItems: entry.latestSearchResult.items.map(item => [item.itemId, item.comparison?.candidateDps ?? null, item.evaluation]),
    selectedItems: entry.latestAssemblyResult.purchases.map(item => [item.itemId, item.variantKey, item.slotType]),
    nativeCalls: fixture.state.simulationCalls, workerRequestPrecision: { actionListMode: 'native', iterations: 1000, dpsError: 1, confidence: 95 },
  };
  serialization = null; selectedStore.deleteAuctionGearSearch(owner, entry.id);
  return result;
}
const rows = [];
try {
  for (const kind of ['quick', 'full']) for (let repeat = 0; repeat < repeats; repeat++) rows.push(await benchmark(kind, repeat));
  const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length / 2)];
  const summary = ['quick', 'full'].map(kind => {
    const samples = rows.filter(row => row.kind === kind);
    return { kind, repeats, medianTotalMs: median(samples.map(row => row.totalMs)), medianFirstComparisonMs: median(samples.map(row => row.firstClientComparisonMs)),
      medianFirstLoadoutMs: median(samples.map(row => row.firstClientLoadoutMs)), medianPollSleepMs: median(samples.map(row => row.phases.clientPollSleep?.totalMs ?? 0)),
      posts: samples.map(row => row.postCount), polls: samples.map(row => row.pollCount), healthProbes: samples.map(row => row.phases.health?.calls ?? 0),
      nativeCalls: samples.map(row => row.nativeCalls), verifiedItems: samples.map(row => row.verifiedItems), exhaustiveComplete: samples.map(row => row.exhaustiveComplete) };
  });
  const outputDirectory = process.env.AUCTION_PIPELINE_OUTPUT_DIR ?? path.join(root,'work/gear-planner');
  const output = path.join(outputDirectory, `pipeline-${version}-${label}.json`);
  const artifactSources = path.join(outputDirectory, `${version}-${label}-sources`);
  await mkdir(artifactSources,{recursive:true});
  for(const [name,text] of Object.entries(sources)) await writeFile(path.join(artifactSources,`${name}.ts.txt`),text);
  await writeFile(path.join(artifactSources,'hashes.json'),JSON.stringify({baselineRef,sourceHashes,sharedImports},null,2)+'\n');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ scope: 'Actual component run loop (no DOM), Client, Policy, Jobs, Runner, Planner and durable checkpoints. Synthetic upstream/native facts and explicit timer/HTTP boundaries. No account, native process or external request.',
    version, baselineRef, sourceHashes, sharedImports, fixture: { delays, distinctItems: 24, slots: ['WRIST'], baselineDps: 1000 }, summary, rows }, null, 2) + '\n');
  console.log(JSON.stringify({ output, summary }));
} finally {
  globalThis.fetch = originalFetch; v8.serialize = originalSerialize; syncBuiltinESMExports();
  delete process.env.GILDRA_AUCTION_STATE_DIR; await rm(directory, { recursive: true, force: true });
}
