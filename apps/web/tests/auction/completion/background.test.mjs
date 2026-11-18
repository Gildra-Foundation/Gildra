import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import * as jobs from '../../../lib/wow/auctionGearJobs.ts';
import { readAuctionState } from '../../../lib/wow/auctionGearPersistence.ts';
import { auctionGearAssemblyGoalComplete } from '../../../lib/wow/auctionGearEnhancementMode.ts';
import { parseAuctionClientRecentRecovery } from '../../../lib/wow/auctionGearClient.ts';

// Actual route, Jobs/persistence and full-task wrapper; synthetic account/native transport only.
const source = await readFile(new URL('../../../lib/wow/auctionGearBackground.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source.replace(/^import[\s\S]*?;\n/gm, '')).replace('export function', 'function');
const tick = () => new Promise(resolve => setImmediate(resolve));
const digest = value => createHash('sha256').update(value).digest('hex');
let h;
const full = vm.runInNewContext(code + ';fullAuctionGearTask', {
  AbortSignal, auctionGearAssemblyGoalComplete,
  getAuctionGearSearch: (owner, id) => owner === h.owner && id === h.entry.id ? h.entry : null,
  selectedAuctionGearAssemblyOptions: (_entry, selection) => h.options.filter(id => !selection.excludedOptionIds.includes(id)),
  verifyAuctionGearSearch: async (_entry, token, signal) => { assert.equal(token, h.token); signal.throwIfAborted(); h.verifies++; if (h.verifyError) throw Error(h.verifyError); },
  continueAuctionGearSearch: async (_entry, signal) => { signal.throwIfAborted(); h.searches++; return h.search(h.searches >= 3); },
  assembleAuctionGearSearch: async (_entry, selection, signal) => {
    signal.throwIfAborted(); h.assemblies++; h.selections.push(structuredClone(selection)); return h.assembly(h.assemblies >= 3);
  },
});
globalThis.__auctionBackgroundTest = { auth: () => h ? { battleNetAccessToken: h.token } : null,
  start: async (_input, _owner, _token, signal, _progress, created) => {
    h.starts++; created(h.entry.id); await h.initial; signal.throwIfAborted(); return h.search(h.searches >= 3);
  }, full, entry: (owner, id) => h?.owner === owner && h.entry.id === id ? h.entry : null,
};
const dataModule = code => ({ url: `data:text/javascript,${encodeURIComponent(code)}`, shortCircuit: true });
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@/auth') return dataModule('export async function auth(){return globalThis.__auctionBackgroundTest.auth()}');
  if (specifier === '@/lib/wow/auctionGearBackground') return dataModule('export const fullAuctionGearTask=(...args)=>globalThis.__auctionBackgroundTest.full(...args)');
  if (specifier === '@/lib/wow/auctionGearRunner') return dataModule(`
    export const startAuctionGearSearch=(...args)=>globalThis.__auctionBackgroundTest.start(...args);
    export const continueAuctionGearSearch=async()=>{throw Error('unexpected_manual_resume')};
    export const assembleAuctionGearSearch=async()=>{throw Error('unexpected_manual_assembly')};
    export const selectedAuctionGearAssemblyOptions=()=>[];
    export const verifyAuctionGearSearch=async()=>{};`);
  if (specifier === '@/lib/wow/auctionGearSearchStore') return dataModule(`
    export const getAuctionGearSearch=(...args)=>globalThis.__auctionBackgroundTest.entry(...args);
    export const reserveAuctionGearSearch=()=>()=>{}; export const saveAuctionGearSearch=()=>{};`);
  if (specifier === 'next/server') return next('next/server.js', context);
  return next(specifier, context);
} });
const route = await import('../../../app/api/wow/auction-gear-plans/route.ts');
after(() => { hooks.deregister(); delete globalThis.__auctionBackgroundTest; });
const base = { action: 'search', characterSlug: 'synthetic-background', locale: 'en', budgetGold: '10',
  selectedSlots: ['HEAD'], scenario: 'single-target', enhancementMode: 'equipment', runMode: 'full' };
async function fixture(callback) {
  const token = `synthetic-${randomUUID()}`, owner = digest(`battle-net:${token}`), id = randomUUID();
  let release;
  h = { token, owner, starts: 0, searches: 0, assemblies: 0, verifies: 0, selections: [], options: ['one', 'two'],
    initial: new Promise(resolve => { release = resolve; }), release: () => release(),
    entry: { id, context: { input: { characterSlug: base.characterSlug, locale: 'en', budgetCopper: 100000, scenario: 'single-target', selectedSlots: ['HEAD'], enhancementMode: 'equipment' } }, excludedOptionIds: ['two'], excludedVariantKeys: ['excluded-variant'] },
    search: complete => ({ kind: 'search', searchId: id, items: [{ optionId: 'one' }], searchComplete: complete, budgetCopper: 100000 }),
    assembly: complete => ({ kind: 'assembly', searchId: id, exhaustiveComplete: complete, enhancementMode: 'equipment', budgetCopper: 100000 }),
  };
  try { await callback(h); }
  finally { release(); for (const job of globalThis.__gildraAuctionJobs.values()) if (job.owner === owner) jobs.cancelAuctionGearJob(owner, job.id); for (let i = 0; i < 5; i++) await tick(); h = undefined; }
}
async function request(method, query = {}, body, controller) {
  const response = await route[method](new Request(`https://gildra.example/api/wow/auction-gear-plans?${new URLSearchParams(query)}`, {
    method, signal: controller?.signal, headers: { host: 'gildra.example', origin: 'https://gildra.example' }, ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  return { status: response.status, body: await response.json() };
}
async function settled(owner, id) {
  for (let i = 0; i < 100; i++) { await tick(); const job = jobs.getAuctionGearJob(owner, id); if (!['queued', 'running'].includes(job.status)) return job; }
  throw Error('synthetic_job_never_settled');
}
const latest = () => ({ latest: '1', characterSlug: base.characterSlug, locale: 'en' });

test('one accepted full job completes all exact turns without browser polls or continuation POSTs', async () => fixture(async state => {
  const disconnected = new AbortController();
  const posted = await request('POST', {}, { ...base, clientRequestId: randomUUID() }, disconnected);
  assert.equal(posted.status, 202); assert.equal(posted.body.runMode, 'full'); disconnected.abort(); state.release();
  for (let i = 0; i < 30; i++) await tick();
  const result = jobs.getAuctionGearJob(state.owner, posted.body.id);
  assert.equal(result.status, 'completed'); assert.equal(result.mode, 'assembly'); assert.equal(result.result.exhaustiveComplete, true);
  assert.deepEqual([state.starts, state.searches, state.assemblies, state.verifies], [1, 3, 3, 6]);
  assert(state.selections.every(s => s.excludedOptionIds.join() === 'two' && s.excludedVariantKeys.join() === 'excluded-variant'));
  const recovered = await request('GET', latest());
  assert.equal(recovered.body.job.id, posted.body.id); assert.equal(recovered.body.formIntent.enhancementMode, 'equipment'); assert.deepEqual(recovered.body.excludedOptionIds, ['two']);
  assert.equal(parseAuctionClientRecentRecovery(recovered.body, { characterSlug: base.characterSlug, locale: 'en' }).job.status, 'completed');
  assert(!JSON.stringify(recovered.body).includes(state.token));
}));

test('duplicate full POST and scoped discovery keep one identity; nonce execution changes are rejected', async () => fixture(async state => {
  const body = { ...base, clientRequestId: randomUUID() }, first = await request('POST', {}, body), replay = await request('POST', {}, body);
  assert.equal(replay.body.id, first.body.id); assert.equal(state.starts, 1); assert.equal((await request('GET', latest())).body.job.id, first.body.id);
  assert.equal((await request('POST', {}, { ...body, runMode: undefined })).status, 400);
  assert.equal((await request('POST', {}, { ...body, clientRequestId: randomUUID() })).status, 409);
  assert.equal((await request('GET', { ...latest(), locale: 'ru' })).body.job, null);
  assert.equal((await request('GET', { ...latest(), characterSlug: 'other' })).body.job, null);
  assert.equal((await request('GET', { ...latest(), after: 'a'.repeat(20) })).status, 400);
  assert.equal((await request('POST', {}, { ...base, runMode: 'forever' })).status, 400);
  jobs.cancelAuctionGearJob(state.owner, first.body.id); state.release();
  assert.equal((await settled(state.owner, first.body.id)).status, 'cancelled'); assert.equal(state.searches, 0); assert.equal(state.assemblies, 0);
}));

test('cancel-before-acceptance tombstone prevents every full turn', async () => fixture(async state => {
  const clientRequestId = randomUUID(), cancelled = await request('DELETE', { clientRequestId, characterSlug: base.characterSlug, locale: 'en' });
  const posted = await request('POST', {}, { ...base, clientRequestId });
  assert.equal(cancelled.status, 200); assert.equal(posted.body.id, cancelled.body.id); assert.equal(posted.body.status, 'cancelled'); assert.equal(state.starts, 0);
}));

test('empty eligible pool ends cleanly; legacy absent runMode remains one bounded turn', async () => {
  await fixture(async state => { state.options = []; state.searches = 3; const posted = await request('POST', {}, base); state.release();
    const result = await settled(state.owner, posted.body.id); assert.equal(result.status, 'completed'); assert.equal(result.result.kind, 'search'); assert.equal(state.assemblies, 0); });
  await fixture(async state => { const posted = await request('POST', {}, { ...base, runMode: undefined }); state.release();
    const result = await settled(state.owner, posted.body.id); assert.equal(result.status, 'completed'); assert.equal(result.runMode, undefined); assert.equal(state.searches, 0); assert.equal(state.assemblies, 0); });
});

test('changed profile fails without further simulation or claiming completion', async () => fixture(async state => {
  state.verifyError = 'character_snapshot_changed'; const posted = await request('POST', {}, base); state.release();
  const result = await settled(state.owner, posted.body.id); assert.equal(result.status, 'failed'); assert.equal(result.error, state.verifyError); assert.equal(state.searches, 0); assert.equal(state.assemblies, 0);
}));

test('durable full intent and completed result survive a fresh process without tokens or duplicate work', async () => {
  assert.equal(process.env.GILDRA_AUCTION_STATE_DIR, undefined); const directory = await mkdtemp(join(tmpdir(), 'gildra-background-'));
  process.env.GILDRA_AUCTION_STATE_DIR = directory;
  try { await fixture(async state => {
    const posted = await request('POST', {}, { ...base, clientRequestId: randomUUID() }); state.release(); await settled(state.owner, posted.body.id);
    const record = readAuctionState('job', posted.body.id); assert.equal(record.data.work.runMode, 'full'); assert.equal(record.data.runMode, 'full'); assert(!JSON.stringify(record).includes(state.token));
    const source = `import assert from 'node:assert/strict';
      import {getLatestAuctionGearFullJob,getAuctionGearPendingWork} from ${JSON.stringify(new URL('../../../lib/wow/auctionGearJobs.ts', import.meta.url).href)};
      const recovered=getLatestAuctionGearFullJob(${JSON.stringify(state.owner)},${JSON.stringify({characterSlug:base.characterSlug,locale:'en'})});
      assert.equal(recovered.job.id,${JSON.stringify(posted.body.id)});assert.equal(recovered.job.status,'completed');assert.equal(recovered.job.result.exhaustiveComplete,true);
      assert.equal(getAuctionGearPendingWork(${JSON.stringify(state.owner)},recovered.job.id),null);console.log('restored');`;
    const output = execFileSync(process.execPath, ['--experimental-transform-types','--no-warnings','--import',new URL('../resolve.mjs',import.meta.url).href,'--input-type=module','-e',source], { env: {...process.env}, encoding:'utf8', timeout:15000 });
    assert.equal(output.trim(), 'restored');
  }); } finally { delete process.env.GILDRA_AUCTION_STATE_DIR; await rm(directory,{recursive:true,force:true}); }
});
