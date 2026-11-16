/** Synthetic GET transport only; no jobs, sessions, native processes or external requests. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchAuctionClientUpdate, AuctionClientError } from '../../../lib/wow/auctionGearClient.ts';
const originalFetch=globalThis.fetch;
const scope={characterSlug:'eu--synthetic--one',locale:'en'};
const previous={id:'owned-job',status:'running',revision:'opaque_revision_123456'};
const response=(body=previous,status=200)=>Response.json(body,{status});
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test.afterEach(()=>{globalThis.fetch=originalFetch;});

test('valid opaque revision sends an immediate owned GET after and retains no-store/signal',async()=>{
 const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return response({...previous,status:'completed',revision:'changed_revision_123456'});};
 const pending=fetchAuctionClientUpdate(previous,scope,new AbortController().signal,()=>assert.fail('unexpected reconnect'));
 assert.equal(calls.length,1,'no client timer may delay revision delivery');
 const result=await pending,url=new URL(calls[0].url,'http://synthetic.invalid');
 assert.equal(url.searchParams.get('id'),previous.id);assert.equal(url.searchParams.get('after'),previous.revision);
 assert.equal(url.searchParams.get('characterSlug'),scope.characterSlug);assert.equal(url.searchParams.get('locale'),scope.locale);
 assert.equal(calls[0].options.cache,'no-store');assert(calls[0].options.signal);assert.equal(result.status,'completed');
});
test('missing or malformed revisions keep bounded legacy delay then GET without after',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const revision of [undefined,null,'','short','x'.repeat(101),'bad / revision 123456','<script>not-revision</script>']){
  let calls=0;globalThis.fetch=async url=>{calls++;assert(!new URL(url,'http://synthetic.invalid').searchParams.has('after'));return response();};
  const pending=fetchAuctionClientUpdate({...previous,revision},scope,new AbortController().signal,()=>{});
  assert.equal(calls,0);t.mock.timers.tick(249);assert.equal(calls,0);t.mock.timers.tick(1);await pending;assert.equal(calls,1);
 }
});
test('old server response without revision switches the next request to legacy cadence',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let calls=0;
 globalThis.fetch=async()=>{calls++;return response({id:previous.id,status:'running'});};
 const old=await fetchAuctionClientUpdate(previous,scope,new AbortController().signal,()=>{});assert.equal(calls,1);
 const next=fetchAuctionClientUpdate(old,scope,new AbortController().signal,()=>{},4);
 t.mock.timers.tick(1499);assert.equal(calls,1);t.mock.timers.tick(1);await next;assert.equal(calls,2);
});
test('wait-limit429 causes exactly one bounded legacy delay and unqualified GET',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const calls=[];
 globalThis.fetch=async url=>{calls.push(url);return calls.length===1?response({error:'plan_wait_limit'},429):response({...previous,status:'completed'});};
 const pending=fetchAuctionClientUpdate(previous,scope,new AbortController().signal,()=>assert.fail('429 is not a reconnect'));
 await turn();assert.equal(calls.length,1);t.mock.timers.tick(249);assert.equal(calls.length,1);t.mock.timers.tick(1);
 const result=await pending;assert.equal(result.status,'completed');assert.equal(calls.length,2);
 assert(new URL(calls[0],'http://synthetic.invalid').searchParams.has('after'));assert(!new URL(calls[1],'http://synthetic.invalid').searchParams.has('after'));
});
test('aborting an owned wait releases only its HTTP request and never DELETEs the job',async()=>{
 const controller=new AbortController(),calls=[];let aborted=false;
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(options.signal.reason);},{once:true}));};
 const pending=fetchAuctionClientUpdate(previous,scope,controller.signal,()=>assert.fail('cancel is not reconnect'));
 controller.abort();await assert.rejects(pending,{name:'AbortError'});assert(aborted);assert.equal(calls.length,1);
 assert(calls.every(call=>(call.options.method??'GET')==='GET'));
});
test('pre-aborted wait starts no transport, including legacy fallback',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return response();};const controller=new AbortController();controller.abort();
 for(const row of[previous,{...previous,revision:undefined}])await assert.rejects(fetchAuctionClientUpdate(row,scope,controller.signal,()=>{}),{name:'AbortError'});
 assert.equal(calls,0);
});
test('identity mismatch fails without accepting another job or retrying',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return response({...previous,id:'other-owner-job'});};
 await assert.rejects(fetchAuctionClientUpdate(previous,scope,new AbortController().signal,()=>{}),error=>error instanceof AuctionClientError&&error.message==='invalid_plan_result'&&!error.reconnect);
 assert.equal(calls,1);
});
test('auth/scope and unrelated quota errors preserve terminal behavior without fallback',async()=>{
 for(const[status,error]of[[401,'session_expired'],[403,'cross_site_blocked'],[429,'plan_rate_limited']]){
  let calls=0;globalThis.fetch=async()=>{calls++;return response({error},status);};
  await assert.rejects(fetchAuctionClientUpdate(previous,scope,new AbortController().signal,()=>{}),failure=>failure instanceof AuctionClientError&&failure.status===status&&failure.message===error);
  assert.equal(calls,1);
 }
});
test('transient wait transport retains existing reconnect delay and retries the same revision',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let calls=0,reconnects=0;
 globalThis.fetch=async url=>{calls++;assert.equal(new URL(url,'http://synthetic.invalid').searchParams.get('after'),previous.revision);return calls===1?response({},503):response({...previous,status:'completed'});};
 const pending=fetchAuctionClientUpdate(previous,scope,new AbortController().signal,()=>{reconnects++;});
 await turn();assert.equal(reconnects,1);t.mock.timers.tick(749);assert.equal(calls,1);t.mock.timers.tick(1);
 assert.equal((await pending).status,'completed');assert.equal(calls,2);
});

test('long wait adds five-second hold allowance while legacy and429 fallback retain10s',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const timeouts=[],actual=AbortSignal.timeout;
 t.mock.method(AbortSignal,'timeout',ms=>{timeouts.push(ms);return actual.call(AbortSignal,ms);});
 globalThis.fetch=async()=>response();
 await fetchAuctionClientUpdate(previous,scope,new AbortController().signal,()=>{});
 assert.deepEqual(timeouts,[15000]);timeouts.length=0;
 const legacy=fetchAuctionClientUpdate({...previous,revision:undefined},scope,new AbortController().signal,()=>{});
 t.mock.timers.tick(250);await legacy;assert.deepEqual(timeouts,[10000]);timeouts.length=0;
 let calls=0;globalThis.fetch=async()=>++calls===1?response({error:'plan_wait_limit'},429):response();
 const limited=fetchAuctionClientUpdate(previous,scope,new AbortController().signal,()=>{});
 await turn();t.mock.timers.tick(250);await limited;assert.deepEqual(timeouts,[15000,10000]);
});
test('five-second server hold plus seven-second transfer succeeds within the effective network allowance',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const timeouts=[];
 t.mock.method(AbortSignal,'timeout',ms=>{timeouts.push(ms);const controller=new AbortController();setTimeout(()=>controller.abort(new DOMException('Timed out','TimeoutError')),ms);return controller.signal;});
 globalThis.fetch=async(_url,options)=>{
  await new Promise(resolve=>setTimeout(resolve,5000));options.signal.throwIfAborted();
  return {ok:true,status:200,json:async()=>{await new Promise(resolve=>setTimeout(resolve,7000));options.signal.throwIfAborted();return{...previous,status:'completed'};}};
 };
 const controller=new AbortController(),pending=fetchAuctionClientUpdate(previous,scope,controller.signal,()=>assert.fail('no reconnect before15s'));
 t.mock.timers.tick(5000);await turn();t.mock.timers.tick(7000);
 assert.equal((await pending).status,'completed');assert.deepEqual(timeouts,[15000]);
});
