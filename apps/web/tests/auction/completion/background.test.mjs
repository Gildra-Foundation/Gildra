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
import { readAuctionState, writeAuctionState, auctionMeasurementContract } from '../../../lib/wow/auctionGearPersistence.ts';
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

test('full assembly starts after discovery even when single comparisons remain', async () => fixture(async state => {
  state.entry.context.coverage = { discoveryComplete: true };
  state.entry.retainedBaseline = { dps: 1000 };
  const search = state.search;
  state.search = () => ({ ...search(false), discoveryComplete: true, pendingItems: 20 });
  const posted = await request('POST', {}, { ...base, clientRequestId: randomUUID() });
  state.release();
  const job = await settled(state.owner, posted.body.id);
  assert.equal(job.status, 'completed');
  assert.deepEqual([state.searches, state.assemblies], [0, 3]);
  assert(state.selections.every(s => s.excludedOptionIds.join() === 'two'));
}));

test('an equipment search with every lot excluded still terminates', async () => fixture(async state => {
  state.entry.context.coverage = { discoveryComplete: true };
  state.entry.retainedBaseline = { dps: 1000 };
  state.entry.excludedOptionIds = [...state.options];
  const search = state.search;
  state.search = complete => ({ ...search(complete), discoveryComplete: true });
  const posted = await request('POST', {}, { ...base, clientRequestId: randomUUID() });
  state.release();
  const job = await settled(state.owner, posted.body.id);
  assert.equal(job.status, 'completed');
  assert.deepEqual([state.searches, state.assemblies], [3, 0]);
}));

test('a refreshed pool with pending discovery still advances the search', async () => fixture(async state => {
  state.entry.context.coverage = { discoveryComplete: false };
  state.entry.retainedBaseline = { dps: 1000 };
  const search = state.search;
  state.search = complete => ({ ...search(complete), discoveryComplete: true });
  const posted = await request('POST', {}, { ...base, clientRequestId: randomUUID() });
  state.release();
  const job = await settled(state.owner, posted.body.id);
  assert.equal(job.status, 'completed');
  assert.deepEqual([state.searches, state.assemblies], [3, 3]);
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

test('full enhanced waits for the existing enhancement and scenario goals, including explicit unavailable completion', async () => fixture(async state => {
  state.searches = 3;
  state.options = [];
  state.entry.context.input.enhancementMode = 'enhanced';
  state.assembly = () => ({ kind: 'assembly', searchId: state.entry.id, exhaustiveComplete: true, enhancementMode: 'enhanced',
    enhancementOptimization: { complete: state.assemblies >= 3, status: state.assemblies >= 3 ? 'unavailable' : 'pending' },
    scenarioComparisonsComplete: state.assemblies >= 4 });
  const posted = await request('POST', {}, { ...base, enhancementMode: 'enhanced' }); state.release();
  const result = await settled(state.owner, posted.body.id);
  assert.equal(result.status, 'completed'); assert.equal(state.assemblies, 4);
  assert.equal(result.result.enhancementOptimization.status, 'unavailable');
}));

test('recent recovery validates scope and safe intent before exposing an owned full result', () => {
  const scope = { characterSlug: base.characterSlug, locale: 'en' };
  assert.equal(parseAuctionClientRecentRecovery({ job: null }, scope), null);
  assert.throws(() => parseAuctionClientRecentRecovery({ job: { id: 'bad', status: 'completed', runMode: 'full', scope: {...scope,locale:'ru'} } }, scope), /invalid_plan_result/);
  assert.throws(() => parseAuctionClientRecentRecovery({ job: { id: 'bad', status: 'completed', runMode: 'full', mode: 'assembly', scope }, formIntent: null }, scope), /invalid_plan_result/);
});

test('latest discovery is owner-scoped and expires completed work after thirty minutes', async () => fixture(async state => {
  state.options = []; state.searches = 3;
  const posted = await request('POST', {}, base); state.release(); await settled(state.owner, posted.body.id);
  const scope = { characterSlug: base.characterSlug, locale: 'en' };
  assert.equal(jobs.getLatestAuctionGearFullJob('another-owner', scope).job, null);
  const now = Date.now, future = now() + 31 * 60_000;
  try { Date.now = () => future; assert.equal(jobs.getLatestAuctionGearFullJob(state.owner, scope).job, null); }
  finally { Date.now = now; }
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

test('interrupted full work stays parked until owner reattachment, then actual Work resumes exactly once', async () => {
  assert.equal(process.env.GILDRA_AUCTION_STATE_DIR, undefined);
  const directory = await mkdtemp(join(tmpdir(), 'gildra-background-resume-'));
  process.env.GILDRA_AUCTION_STATE_DIR = directory;
  try {
    const id = randomUUID(), searchId = randomUUID(), owner = 'synthetic-restored-owner', now = Date.now();
    const record = { id, owner, runMode:'full', mode:'search', status:'running', scope:{characterSlug:base.characterSlug,locale:'en'},
      searchId, result:null, progress:null, error:null, createdAt:now, expires:now+60000, continuation:true, recency:1,
      work:{ action:'resume', searchId, runMode:'full' }, resultMeasurementContract:auctionMeasurementContract };
    const {work, result, progress, ...metadata}=record; void work; void result; void progress;
    writeAuctionState('job',id,record.expires,record,{metadata:{...metadata,hasWork:true}});
    const child = `import assert from 'node:assert/strict';import{registerHooks}from'node:module';
      globalThis.fixture={calls:0,verifies:0,entry:{id:${JSON.stringify(searchId)},context:{input:{characterSlug:${JSON.stringify(base.characterSlug)},locale:'en'}},excludedOptionIds:['excluded'],excludedVariantKeys:[]}};
      const hook=registerHooks({resolve(s,c,n){
        const module=code=>({url:'data:text/javascript,'+encodeURIComponent(code),shortCircuit:true});
        if(s==='./auctionGearRunner')return module(\`
          export const startAuctionGearSearch=()=>{throw Error('unexpected_fresh_search')};
          export const continueAuctionGearSearch=async()=>{fixture.calls++;return{kind:'search',searchId:fixture.entry.id,searchComplete:true}};
          export const assembleAuctionGearSearch=async(_entry,selection)=>{fixture.calls++;if(selection.excludedOptionIds[0]!=='excluded')throw Error('lost_selection');return{kind:'assembly',searchId:fixture.entry.id,enhancementMode:'equipment',exhaustiveComplete:true}};
          export const selectedAuctionGearAssemblyOptions=()=>[{}];export const verifyAuctionGearSearch=async()=>{fixture.verifies++};\`);
        if(s==='./auctionGearSearchStore')return module('export const getAuctionGearSearch=()=>fixture.entry;export const reserveAuctionGearSearch=()=>()=>{};');
        return n(s,c);
      }});
      const jobs=await import(${JSON.stringify(new URL('../../../lib/wow/auctionGearJobs.ts', import.meta.url).href)});
      const {resumeOwnedAuctionGearWork}=await import(${JSON.stringify(new URL('../../../lib/wow/auctionGearWork.ts', import.meta.url).href)});
      const owner=${JSON.stringify(owner)},id=${JSON.stringify(id)};
      assert.equal(jobs.getAuctionGearJob(owner,id).status,'queued');assert.equal(fixture.calls,0);
      resumeOwnedAuctionGearWork('wrong-owner',id,'synthetic-token');assert.equal(fixture.calls,0);
      resumeOwnedAuctionGearWork(owner,id,'synthetic-token');resumeOwnedAuctionGearWork(owner,id,'synthetic-token');
      for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));
      assert.equal(jobs.getAuctionGearJob(owner,id).status,'completed');assert.equal(fixture.calls,2);assert.equal(fixture.verifies,2);
      console.log('resumed');hook.deregister();`;
    const output=execFileSync(process.execPath,['--experimental-transform-types','--no-warnings','--import',new URL('../resolve.mjs',import.meta.url).href,'--input-type=module','-e',child],{env:{...process.env},encoding:'utf8',timeout:15000});
    assert.equal(output.trim(),'resumed');
  } finally { delete process.env.GILDRA_AUCTION_STATE_DIR; await rm(directory,{recursive:true,force:true}); }
});
