import assert from 'node:assert/strict';
import {registerHooks,syncBuiltinESMExports} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import v8 from 'node:v8';
import test from 'node:test';
assert.equal(process.env.GILDRA_AUCTION_STATE_DIR,undefined,'Never use production checkpoints');
const transport={pages:0,details:0};globalThis.__warmSearchTransport=transport;
const source=`const s=globalThis.__warmSearchTransport;
const row=id=>({id:'offline-'+id,externalId:id,type:'item',slug:'offline-'+id,name:'Synthetic '+id,iconUrl:'https://example.invalid/item.jpg',itemLevel:100,highlights:[{key:'inventory_type',value:'Wrist'}],payload:{ItemLevel:100,ExpansionID:11},tooltip:{blocks:[{type:'item_registry',class_id:id>=1000&&id!==99999?19:4,subclass_id:4,inventory_type:9}]}});
export async function getCatalogPage(input){s.pages++;await new Promise(r=>setImmediate(r));input.signal?.throwIfAborted();return{data:input.externalIds.map(row),pagination:{hasMore:false}};}
export async function getCatalogEntity(id,locale,dataset,fresh,signal){s.details++;signal?.throwIfAborted();return row(Number(id.slice('offline-'.length)));}`;
const hook=registerHooks({resolve(s,c,next){if(s==='@/lib/api/client')return{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true};return next(s,c);}});
const repository=await import('../../../lib/wow/gearCandidateRepository.ts');
const {harness,character,offer,market}=await import('../reliability/market-harness.mjs');
const store=await import('../../../lib/wow/auctionGearSearchStore.ts');let sequence=0;
const start=(h,budget=900,slots=['WRIST'])=>h.runner.startAuctionGearSearchFromSnapshot({characterSlug:'synthetic',budgetCopper:budget,scenario:'single-target',locale:'en',selectedSlots:slots},character,h.state.armory,'warm-search-'+(++sequence),'synthetic',h.signal(),h.progress);

test('changed budget reuses raw catalog and DPS, but still verifies current native variants',async()=>{const h=await harness({repository});await h.start();const before={...transport},sim=h.state.simulationCalls,variants=h.state.variantCalls,markets=h.state.marketCalls;const result=await start(h);assert.equal(transport.pages,before.pages);assert.equal(transport.details,before.details);assert.equal(h.state.simulationCalls,sim);assert(h.state.variantCalls>variants);assert(h.state.marketCalls>markets);assert.equal(result.items[0].evaluation,'upgrade');});
test('cached catalog never reuses old prices, quantities or sold auction IDs',async()=>{const h=await harness({repository});await h.start();h.state.market=market([{...offer(1,77),buyoutCopper:200,quantity:2}]);const result=await start(h);assert(result.items.length>0);assert(result.items.every(item=>item.auctionId===77&&item.lotCostCopper===200&&item.quantity===2));assert.equal(result.items[0].lotCostCopper,200);});
test('new variant still receives a new native comparison with a warm catalog',async()=>{const h=await harness({repository});await h.start();const before=h.state.simulationCalls;h.state.market=market([{...offer(2,78),buyoutCopper:200}]);const result=await start(h);assert(h.state.simulationCalls>before);assert.equal(result.items[0].comparison.candidateDps,1020);});
test('new native engine cannot reuse earlier engine DPS through catalog hits',async()=>{const h=await harness({repository});await h.start();const before=h.state.simulationCalls;h.state.workerEngine='SimulationCraft synthetic-v2';await start(h);assert(h.state.simulationCalls>=before+2);});
test('slot changes recompute eligibility rather than caching a candidate decision',async()=>{const h=await harness({repository});await h.start();const result=await start(h,900,['HEAD']);assert.equal(result.items.length,0);});
test('warm large-market traversal coalesces full checkpoints instead of serializing each catalog batch',async()=>{const directory=await mkdtemp(join(tmpdir(),'gildra-warm-search-'));const original=v8.serialize;process.env.GILDRA_AUCTION_STATE_DIR=directory;try{const h=await harness({repository});h.state.market=market([offer(),...Array.from({length:5001},(_,i)=>({...offer(1,i+1000),itemId:i+1000}))]);await h.start();let serializations=0;v8.serialize=(...args)=>{serializations++;return original(...args);};syncBuiltinESMExports();const before={...transport};await start(h);assert.equal(transport.pages,before.pages);assert.equal(transport.details,before.details);assert(serializations<=3,`Warm traversal serialized ${serializations} full snapshots`);}finally{v8.serialize=original;syncBuiltinESMExports();for(const entry of [...globalThis.__gildraAuctionGearSearches.values()])store.deleteAuctionGearSearch(entry.owner,entry.id);delete process.env.GILDRA_AUCTION_STATE_DIR;await rm(directory,{recursive:true,force:true});}});
test.after(()=>{hook.deregister();delete globalThis.__warmSearchTransport;});
