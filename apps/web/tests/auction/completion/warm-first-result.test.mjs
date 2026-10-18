import assert from 'node:assert/strict';
import {registerHooks,syncBuiltinESMExports} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import v8 from 'node:v8';
import test from 'node:test';

assert.equal(process.env.GILDRA_AUCTION_STATE_DIR,undefined,'Never use production checkpoints');
const transport={pages:0,ids:[],detailIds:[],rows:new Map(),delay:0,repaired:false,hold:null};
globalThis.__warmFirstResult=transport;
const source=`const s=globalThis.__warmFirstResult;
const missing=id=>id>=1000&&id<4500&&(id-1000)%500===450;
const row=id=>s.rows.get(id)??({id:'offline-'+id,externalId:id,type:'item',slug:'offline-'+id,name:'Synthetic '+id,iconUrl:'https://example.invalid/item.jpg',itemLevel:100,highlights:[{key:'inventory_type',value:'Wrist'}],payload:{ItemLevel:100,ExpansionID:11},tooltip:{blocks:[{type:'item_registry',class_id:id>=1000&&id!==99999&&!(missing(id)&&s.repaired)?19:4,subclass_id:4,inventory_type:9}]}});
export async function getCatalogPage(input){s.pages++;s.ids.push([...input.externalIds]);if(s.hold)await s.hold;if(s.delay)await new Promise(r=>setTimeout(r,s.delay));input.signal?.throwIfAborted();return{data:input.externalIds.filter(id=>s.repaired||!missing(id)).map(row),pagination:{hasMore:false}};}
export async function getCatalogEntity(id,locale,dataset,fresh,signal){signal?.throwIfAborted();const n=Number(id.slice('offline-'.length));s.detailIds.push(n);return row(n);}`;
const hook=registerHooks({resolve(s,c,next){if(s==='@/lib/api/client')return{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true};return next(s,c);}});
const repository=await import('../../../lib/wow/gearCandidateRepository.ts');
const {harness,character,offer,market,record}=await import('../reliability/market-harness.mjs');
const store=await import('../../../lib/wow/auctionGearSearchStore.ts');
const persistence=await import('../../../lib/wow/auctionGearPersistence.ts');
const missing=id=>id>=1000&&id<4500&&(id-1000)%500===450;
let sequence=0;
const start=(h,signal=h.signal())=>h.runner.startAuctionGearSearchFromSnapshot({characterSlug:'synthetic',budgetCopper:900,scenario:'single-target',locale:'en',selectedSlots:['WRIST']},character,h.state.armory,'warm-first-'+(++sequence),'synthetic',signal,h.progress);

test('first warm verified upgrade precedes expired missing-fact repair; cancellation keeps the tail and repair still joins later',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'gildra-warm-first-')),originalNow=Date.now,originalSerialize=v8.serialize;
 process.env.GILDRA_AUCTION_STATE_DIR=directory;
 let offset=0,snapshots;
 Date.now=()=>originalNow()+offset;
 v8.serialize=(...args)=>{const began=performance.now(),bytes=originalSerialize(...args);snapshots?.push({bytes:bytes.length,ms:performance.now()-began});return bytes;};syncBuiltinESMExports();
 try{
  const h=await harness({repository});
  h.state.market=market([offer(),...Array.from({length:3500},(_,i)=>({...offer(missing(i+1000)?5:1,i+1000),itemId:i+1000}))]);
  const cold=await h.start();
  assert.equal(cold.result.coverage.itemsScanned,3501,'Cold summary-first discovery must visit the complete summary domain before the first native result');
  assert.equal(cold.result.coverage.catalogUnmatchedItemIds,7);
  const pages=transport.pages,calls=h.state.simulationCalls,variants=h.state.variantCalls;
  offset=61000;transport.delay=120;snapshots=[];
  const began=performance.now(),result=await start(h),elapsedMs=performance.now()-began;
  const firstSnapshots=[...snapshots];snapshots=undefined;
  assert.equal(transport.pages,pages,'The first known upgrade must publish before any expired missing-fact request');
  assert.equal(h.state.simulationCalls,calls,'Unchanged profile and native mechanics reuse DPS only after current variant verification');
  assert(h.state.variantCalls>variants,'Warm raw facts never replace current native variant verification');
  assert.equal(result.items[0].evaluation,'upgrade');assert.equal(result.items[0].comparison.candidateDps,1010);
  assert.equal(result.discoveryComplete,false);assert.equal(result.searchComplete,false);
  assert.equal(result.coverage.itemsTotal-result.coverage.itemsScanned,7,'All seven unknown IDs remain reachable');
  assert(firstSnapshots.length<=2,`First warm response serialized ${firstSnapshots.length} full snapshots`);
  const entry=store.getAuctionGearSearch('warm-first-'+sequence,result.searchId);
  let durable=persistence.readAuctionState('search',result.searchId);
  assert.equal(durable.data.latestSearchResult.searchId,result.searchId);
  assert.deepEqual(JSON.parse(JSON.stringify(durable.data.latestSearchResult)),JSON.parse(JSON.stringify(result)));
  // Continue from the exact decoded durable discovery queue, not a test-only
  // reconstruction of the missing IDs. A restart retains this same domain.
  entry.context.discovery=durable.data.context.discovery;
  const cursor=entry.context.discovery.itemCursor;
  const controller=new AbortController();let release;
  transport.hold=new Promise(resolve=>{release=resolve;});
  const cancelled=h.runner.continueAuctionGearSearch(entry,controller.signal,h.progress,'synthetic');
  await new Promise(resolve=>setImmediate(resolve));controller.abort();release();
  await assert.rejects(cancelled,/abort/i);transport.hold=null;transport.delay=0;
  assert.equal(entry.context.discovery.itemCursor,cursor,'Cancelled catalog repair must retain its queue position');
  durable=persistence.readAuctionState('search',result.searchId);
  assert.equal(durable.data.context.discovery.itemCursor,cursor,'Cancellation still crosses the durable checkpoint barrier');
  transport.repaired=true;
  let completed=result;
  for(let step=0;!completed.searchComplete;step++){
   assert(step<20,'The full unknown domain must eventually complete');
   completed=await h.runner.continueAuctionGearSearch(entry,h.signal(),h.progress,'synthetic');
  }
  assert.equal(completed.discoveryComplete,true);assert.equal(completed.dataComplete,true);
  assert.equal(completed.coverage.itemsScanned,3501);assert.equal(completed.coverage.catalogUnmatchedItemIds,0);
  assert(completed.items.some(item=>missing(item.itemId)&&item.comparison?.candidateDps===1050),'A repaired previously missing item must become a newly confirmed improvement');
  assert.equal(entry.context.discovery.itemIds.length,3501,'Continuation must retain one position per item, without dropping or duplicating the market');
  assert.equal(persistence.readAuctionState('search',result.searchId).data.latestSearchResult.searchComplete,true);
  h.state.armory.activeTalentLoadout='changed-synthetic-talents';
  await assert.rejects(h.runner.verifyAuctionGearSearch(entry,'synthetic',h.signal(),false),/character_snapshot_changed/);
  const oldCalls=h.state.simulationCalls;await start(h);
  assert(h.state.simulationCalls>=oldCalls+2,'A changed profile must not inherit the previous baseline or native DPS through warm catalog facts');
  console.log(JSON.stringify({scope:'Actual Runner/Discovery/Repository/Persistence; synthetic public/native facts',firstWarm:{elapsedMs,catalogCalls:0,newDpsCalls:0,snapshots:firstSnapshots},repairedItems:7,finalDiscoveryComplete:completed.discoveryComplete}));
 }finally{
  Date.now=originalNow;v8.serialize=originalSerialize;syncBuiltinESMExports();
  for(const entry of [...globalThis.__gildraAuctionGearSearches.values()])store.deleteAuctionGearSearch(entry.owner,entry.id);
  delete process.env.GILDRA_AUCTION_STATE_DIR;await rm(directory,{recursive:true,force:true});
 }
});
test('exhausted ineligible warm records restore summary priority for unknown viable gear',async()=>{
 const restricted=record(60001);restricted.tooltip.blocks.push({type:'item_requirements',class_mask:'2'});
 const low={...record(60002),itemLevel:10};
 const high={...record(60003),itemLevel:400};
 transport.rows.set(60001,restricted);transport.rows.set(60002,low);transport.rows.set(60003,high);
 await repository.lookupGearRecords([60001],'en_US',undefined,undefined,new AbortController().signal,true);
 const h=await harness({repository});
 h.state.market=market([60001,60002,60003].map(id=>({...offer(1,id),itemId:id})));
 const before=transport.detailIds.length,result=await h.start();
 const fresh=transport.detailIds.slice(before).filter(id=>id===60002||id===60003);
 assert.deepEqual(fresh,[60003,60002],'Unknown high-priority gear must pass an older low hint after the warm candidate is rejected');
 assert.equal(result.result.coverage.itemsScanned,3);assert.equal(result.result.discoveryComplete,true);
 assert(!result.result.items.some(item=>item.itemId===60001),'Fresh catalog facts cannot bypass class eligibility');
});

test('cache-only reads never issue HTTP, return detached facts and do not renew either TTL',async()=>{
 const original=Date.now;let now=original()+10*60000;Date.now=()=>now;
 const lookup=(ids,extra={})=>repository.lookupGearRecords(ids,'en_US',undefined,undefined,new AbortController().signal,true,extra);
 try{
  const before=transport.pages;
  assert.deepEqual(await lookup([48000],{cachedOnly:true}),[]);
  assert.equal(transport.pages,before,'A cold cache-only read cannot start a catalog request');
  await lookup([48000]);const positivePages=transport.pages;
  const cached=await lookup([48000],{cachedOnly:true});cached[0].name='poison';
  assert.notEqual((await lookup([48000],{cachedOnly:true}))[0].name,'poison');
  now+=5*60000+1;
  assert.deepEqual(await lookup([48000],{cachedOnly:true}),[]);
  assert.equal(transport.pages,positivePages,'Expired positives stay unknown until a real lookup is requested');
  transport.repaired=false;await lookup([1450]);const negativePages=transport.pages;
  transport.repaired=true;now+=59999;
  assert.deepEqual(await lookup([1450],{cachedOnly:true}),[]);
  assert.equal(transport.pages,negativePages);
  now+=2;
  assert.equal((await lookup([1450])).length,1,'A cache-only negative read cannot postpone its original 60-second repair deadline');
  assert.equal(transport.pages,negativePages+1);
  const cancelled=new AbortController();cancelled.abort();
  await assert.rejects(repository.lookupGearRecords([1450],'en_US',undefined,undefined,cancelled.signal,true,{cachedOnly:true}),/abort/i);
 }finally{Date.now=original;}
});
test.after(()=>{hook.deregister();delete globalThis.__warmFirstResult;});
