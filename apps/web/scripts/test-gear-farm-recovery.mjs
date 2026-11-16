// Isolated synthetic lifecycle tests: no Blizzard, database, native worker or public HTTP.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createGearFarmJobStore } from '../lib/wow/gearFarm/jobs.ts';
import { GearFarmClient, farmClientWait } from '../lib/wow/gearFarm/client.ts';
import { parseFarmScope, farmScopeKey, farmRecoveryUrl, parseFarmJob } from '../lib/wow/gearFarm/recovery.ts';
const scope = parseFarmScope({characterSlug:'eu--fixture--recovery',profileKey:'profile-a',locale:'en'});
const nonce = (now = Date.now()) => `${now}:${randomUUID()}`;
const identity = (s=scope, n=nonce()) => ({scope:s,clientRequestId:n});
const deferred = () => { let resolve; const promise = new Promise(r=>resolve=r); return {promise,resolve}; };
const result = {character:{name:'Synthetic',level:81,equippedItemLevel:120,specId:72}, activities:[], checkedAt:new Date().toISOString(),profileFingerprint:'synthetic',coverage:{instancesChecked:0,lootItemsChecked:0,exactVariants:0,simulations:0,searchLimited:true}};
const tick = () => new Promise(r=>setTimeout(r,2));
async function until(predicate) {for(let i=0;i<200;i++){if(predicate())return;await tick();}assert.fail('Lifecycle did not settle');}
const mutateScopes = [{profileKey:'profile-b'},{characterSlug:'eu--other--fixture'},{locale:'ru'},{dungeonDifficulty:'heroic'},{raidDifficulty:'heroic'},{dungeonDifficulty:'mythic-plus',mythicKeyLevel:2}].map(change=>parseFarmScope({...scope,...change}));
let now = Date.now();
const retained = createGearFarmJobStore({now:()=>now});
const id = identity(scope, nonce(now)), pending = deferred(); let calls=0;
const first = retained.enqueue('owner-a',async()=>{calls++;await pending.promise;return result;},id);
assert.equal(retained.enqueue('owner-a',async()=>assert.fail('Replay launched work'),id).id, first.id);
assert.equal(retained.get('owner-b',first.id,scope),null);
assert.equal(retained.discover('owner-b',scope),null);
assert.equal(retained.cancel('owner-b',first.id,scope),null);
for(const changed of mutateScopes){assert.equal(retained.discover('owner-a',changed),null);assert.equal(retained.get('owner-a',first.id,changed),null);assert.equal(retained.cancel('owner-a',first.id,changed),null);}
assert.throws(()=>retained.enqueue('owner-a',async()=>result,identity(scope)),/plan_already_running/);
pending.resolve();await until(()=>retained.get('owner-a',first.id)?.status==='completed');
assert.equal(calls,1);
assert.equal(retained.discover('owner-a',scope).result,result);
const expiry=retained.get('owner-a',first.id).expiresAt;
now=expiry-1;assert(retained.get('owner-a',first.id));
assert.equal(retained.get('owner-a',first.id).expiresAt,expiry,'Reading a result cannot extend retention');
now=expiry;assert.equal(retained.discover('owner-a',scope),null);
assert.throws(()=>retained.enqueue('owner-a',async()=>result,id),/plan_request_expired/);

// Explicit cancellation must win before POST acceptance and after work has started.
const store = createGearFarmJobStore();
const cancelledId=identity();
const tombstone=store.cancelRequest('owner-a',cancelledId);
assert.equal(tombstone.status,'cancelled');
assert.equal(store.enqueue('owner-a',async()=>assert.fail('Cancelled request revived'),cancelledId).status,'cancelled');
assert.throws(()=>store.enqueue('owner-a',async()=>result,{...cancelledId,scope:mutateScopes[0]}),/plan_request_conflict/);
const late=deferred();let lateProgress;
const running=store.enqueue('owner-a',async(_signal,progress)=>{lateProgress=progress;await late.promise;progress({phase:'simulating',completed:9,total:9});return result;},identity());
const next=store.enqueue('owner-b',async()=>result,identity());
assert.equal(store.cancel('owner-a',running.id,scope).status,'cancelled');
await until(()=>store.get('owner-b',next.id)?.status==='completed');
lateProgress({phase:'sources',completed:99,total:99});late.resolve();await tick();
assert.equal(store.get('owner-a',running.id).status,'cancelled');
assert.equal(store.get('owner-a',running.id).result,null);
assert.equal(store.get('owner-a',running.id).progress,null);
const deadlineStore=createGearFarmJobStore({deadlineMs:10});
const hung=deadlineStore.enqueue('hung',()=>new Promise(()=>{}),identity());
const afterHung=deadlineStore.enqueue('next',async()=>result,identity());
await until(()=>deadlineStore.get('next',afterHung.id)?.status==='completed');
assert.equal(deadlineStore.get('hung',hung.id).error,'plan_timed_out');
const queuedStore=createGearFarmJobStore({now:()=>now,retentionMs:100});
const block=deferred();
queuedStore.enqueue('block',()=>block.promise,identity(scope,nonce(now)));
let queuedCalls=0;const queued=queuedStore.enqueue('wait',async()=>{queuedCalls++;return result;},identity(scope,nonce(now)));
now+=100;assert.equal(queuedStore.get('wait',queued.id),null);block.resolve(result);await tick();assert.equal(queuedCalls,0);

function browserFixture(){
  const jobs=createGearFarmJobStore(), work=deferred(), requests=[];
  let currentOwner='owner-a', failPolls=0, losePost=false, delayPost=null, failDeletes=false, delayDeletes=null;
  const values=new Map(), storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const fetcher=async(url,init={})=>{
    const method=init.method??'GET', q=new URL(url,'https://synthetic.invalid').searchParams;
    requests.push(method);
    if(method==='POST'){
      const body=JSON.parse(init.body), s=parseFarmScope(body);
      if(delayPost)await delayPost.promise;
      let job;
      try { job=jobs.enqueue(currentOwner,()=>work.promise,{scope:s,clientRequestId:body.clientRequestId}); }
      catch(error) { if(error.message==='plan_already_running')return Response.json({error:error.message,job:jobs.discover(currentOwner,s)},{status:409}); throw error; }
      if(losePost){losePost=false;throw new TypeError('Synthetic lost response');}
      return Response.json(job,{status:202});
    }
    const s=parseFarmScope({...Object.fromEntries(q),...(q.has('mythicKeyLevel')?{mythicKeyLevel:Number(q.get('mythicKeyLevel'))}:{})});
    if(method==='DELETE'){
      if(failDeletes)throw new TypeError('Synthetic offline DELETE');
      const cancelled=q.get('id')?jobs.cancel(currentOwner,q.get('id'),s):jobs.cancelRequest(currentOwner,{scope:s,clientRequestId:q.get('clientRequestId')});
      if(delayDeletes)await delayDeletes.promise;
      return Response.json(cancelled);
    }
    if(failPolls-->0)throw new TypeError('Synthetic offline GET');
    const job=q.get('id')?jobs.get(currentOwner,q.get('id'),s):jobs.discover(currentOwner,s,q.get('clientRequestId')??undefined);
    return q.has('id')||q.has('clientRequestId') ? Response.json(job??{error:'plan_not_found'},{status:job?200:404}) : Response.json({job});
  };
  const clients=[];
  function client(s=scope, opts={}){let state;const c=new GearFarmClient(s,next=>state=next,{fetch:fetcher,storage,wait:(ms,signal)=>farmClientWait(ms===1500?5:1,signal),...opts});clients.push(c);return {c,get state(){return state;}};}
  return {jobs,work,requests,client,storage,close(){clients.forEach(c=>c.detach());work.resolve(result);},set failPolls(v){failPolls=v},set losePost(v){losePost=v},set delayPost(v){delayPost=v},set failDeletes(v){failDeletes=v},set delayDeletes(v){delayDeletes=v},set owner(v){currentOwner=v}};
}
{
 const f=browserFixture(), first=f.client();await first.c.recover();const launched=first.c.start();await until(()=>first.state?.job?.status==='running'||first.state?.job?.status==='queued');
 first.c.detach();await launched;assert.equal(f.requests.filter(m=>m==='DELETE').length,0);
 f.work.resolve(result);await tick();const returned=f.client();await returned.c.recover();assert.equal(returned.state.job.status,'completed');
 assert.equal(f.requests.filter(m=>m==='POST').length,1,'Return discovers completed work without a new POST');
 for(const changed of mutateScopes){const c=f.client(changed);await c.c.recover();assert.equal(c.state.job,undefined);}
 f.owner='owner-b';const other=f.client();await other.c.recover();assert.equal(other.state.job,undefined);f.close();
}
{
 const f=browserFixture(), c=f.client();await c.c.recover();f.failPolls=3;const launched=c.c.start();await launched;
 assert.equal(c.state.error,'plan_connection_interrupted');assert(c.state.recoverable);assert(f.jobs.discover('owner-a',scope));assert.equal(f.requests.filter(m=>m==='DELETE').length,0);
 f.work.resolve(result);await tick();await c.c.recover();assert.equal(c.state.job.status,'completed');assert.equal(f.requests.filter(m=>m==='POST').length,1);f.close();
}
{
 const f=browserFixture(), c=f.client();await c.c.recover();f.losePost=true;const launched=c.c.start();await until(()=>c.state?.job);f.work.resolve(result);await launched;
 assert.equal(c.state.job.status,'completed');assert.equal(f.requests.filter(m=>m==='POST').length,1,'Lost POST response recovers by identity');f.close();
}
{
 const f=browserFixture(), c=f.client();await c.c.recover();const delayed=deferred();f.delayPost=delayed;
 const launched=c.c.start();await until(()=>c.state.starting);await c.c.cancel();assert.equal(c.state.job.status,'cancelled');
 delayed.resolve();await launched;assert.equal(f.jobs.discover('owner-a',scope).status,'cancelled','Late POST cannot revive cancellation');f.close();
}
{
 const f=browserFixture(), c=f.client();await c.c.recover();const launched=c.c.start();await until(()=>c.state?.job);f.failDeletes=true;await c.c.cancel();
 assert(c.state.recoverable);assert.equal(f.jobs.discover('owner-a',scope).status,'running');c.c.detach();await launched;
 f.failDeletes=false;const returned=f.client();await returned.c.recover();assert.equal(returned.state.job.status,'cancelled','Unacknowledged explicit cancellation retries on remount');f.close();
}
{
 const f=browserFixture(), c=f.client(scope,{storage:{getItem(){throw Error('Disabled')},setItem(){throw Error('Disabled')},removeItem(){throw Error('Disabled')}}});await c.c.recover();const delayed=deferred();f.delayPost=delayed;
 const launched=c.c.start();await c.c.cancel();assert.equal(c.state.job.status,'cancelled','Pending cancellation works without browser storage');delayed.resolve();await launched;f.close();
}
{
 const f=browserFixture(), c=f.client();await c.c.recover();
 const existing=f.jobs.enqueue('owner-a',()=>f.work.promise,identity());
 const launched=c.c.start();await until(()=>c.state?.job);assert.equal(c.state.job.id,existing.id);
 f.work.resolve(result);await launched;
 assert.equal(c.state.job.status,'completed');c.c.detach();
 const returned=f.client();await returned.c.recover();assert.equal(returned.state.job.id,existing.id,'409 adoption must clear the rejected nonce');f.close();
}
{
 const f=browserFixture(), first=f.client();await first.c.recover();const launched=first.c.start();await until(()=>first.state?.job);
 const acknowledgement=deferred();f.delayDeletes=acknowledgement;const cancel=first.c.cancel();await until(()=>f.requests.includes('DELETE'));first.c.detach();await launched;
 f.delayDeletes=null;const returned=f.client();await returned.c.recover();assert.equal(returned.state.job.status,'cancelled');
 const newer=returned.c.start();await until(()=>returned.state?.job?.status==='running'||returned.state?.job?.status==='queued');
 const nextId=returned.state.job.clientRequestId;acknowledgement.resolve();await cancel;
 assert.equal(JSON.parse(f.storage.getItem(`gildra:farm:v1:${farmScopeKey(scope)}`)).clientRequestId,nextId,'Late cancellation ACK cannot clear newer mount request');
 returned.c.detach();await newer;f.close();
}
{
 const f=browserFixture();const previous=f.jobs.enqueue('owner-a',async()=>result,identity());await until(()=>f.jobs.get('owner-a',previous.id)?.status==='completed');
 f.storage.setItem(`gildra:farm:v1:${farmScopeKey(scope)}`,JSON.stringify({clientRequestId:nonce(Date.now()-40_000)}));
 const c=f.client();await c.c.recover();assert.equal(c.state.job,undefined,'Missing new request must not restore an unrelated older completed run');assert.equal(c.state.error,'plan_not_found');f.close();
}
{
 const f=browserFixture(), c=f.client();await c.c.recover();const delayed=deferred();f.delayPost=delayed;
 const launched=c.c.start();c.c.detach();delayed.resolve();await launched;f.work.resolve(result);await tick();
 const returned=f.client();await returned.c.recover();assert.equal(returned.state.job.status,'completed');assert.equal(f.requests.filter(m=>m==='DELETE').length,0,'Navigation during POST never cancels server work');f.close();
}
assert.throws(()=>parseFarmJob({...tombstone,scope:mutateScopes[0]},scope),/invalid_plan_result/);
assert(farmRecoveryUrl(scope).includes('profileKey=profile-a'));
assert.notEqual(farmScopeKey(scope),farmScopeKey(mutateScopes[0]));
console.log(JSON.stringify({status:'passed',checks:['idempotent requests','owner/profile/locale/settings isolation','fixed result retention','cancel-before-POST tombstones','late completion/callback isolation','noncooperative deadline releases queue','queued expiry','detach and owned completed discovery','poll and lost-POST recovery without cancellation','cancellation retry/remount','disabled browser storage']}));
