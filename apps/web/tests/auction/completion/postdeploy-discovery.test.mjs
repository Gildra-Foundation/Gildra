import assert from 'node:assert/strict';
import {test} from 'node:test';
import {serialize,deserialize} from 'node:v8';
import {harness,market,offer,record} from '../reliability/market-harness.mjs';
import {auctionVariantKey} from '../../../lib/wow/auctionItemVariant.ts';

assert.equal(process.env.GILDRA_AUCTION_STATE_DIR,undefined,'Offline fixtures must not use live checkpoints');
const unsupported=()=>({...offer(),modifiers:[{type:29,value:79}]});
const advance=(h,state,extra={})=>h.discovery.advanceAuctionGearDiscovery(state,{...h.discoveryInput,...extra});

test('same-item supported arrival in retained runner search matches a fresh current-market search',async()=>{
 const h=await harness();h.state.market=market([unsupported()]);const run=await h.start();
 assert.equal(run.result.items.length,0);assert.equal(run.result.searchComplete,true);assert.equal(run.result.dataComplete,false);
 assert.equal(run.entry.context.discovery.entities.has(1),false,'Unsupported-only armor needs no detailed/native work');
 h.state.market=market([offer(1,20)]);
 await h.runner.verifyAuctionGearSearch(run.entry,'synthetic',h.signal(),false);
 const result=await h.runner.continueAuctionGearSearch(run.entry,h.signal(),h.progress,'synthetic');
 const fresh=await h.start();
 const rows=r=>r.items.map(item=>({itemId:item.itemId,variantKey:item.variantKey,evaluation:item.evaluation,costCopper:item.costCopper}));
 assert.equal(result.items.length,1,'A first supported variant must reopen previously skipped details');
 assert.deepEqual(rows(result),rows(fresh.result));assert.equal(result.items[0].evaluation,'upgrade');
 assert.equal(result.searchComplete,true);assert.equal(result.dataComplete,true);
});

test('V8-restored discovery opens first details even when timed catalog retries are disabled',async()=>{
 const h=await harness();const initial=h.discovery.createAuctionGearDiscovery(market([unsupported()]),1000);await advance(h,initial);
 const state=deserialize(serialize(initial));h.discovery.refreshAuctionGearDiscovery(state,market([offer(1,20)]),{retryCatalog:false});
 assert.equal(h.discovery.auctionGearDiscoveryComplete(state),false);
 await advance(h,state);assert.equal(h.discovery.auctionGearDiscoveryOptions(state).length,1);
 const before=h.state.variantCalls;
 for(let i=0;i<3;i++){h.discovery.refreshAuctionGearDiscovery(state,market([offer(1,20+i)]));await advance(h,state);}
 assert.equal(h.state.variantCalls,before,'Repeat snapshots reuse the resolved effect');
 assert.equal(state.itemIds.length,1);assert.equal(state.queuedItems.size,1);
});

test('already-buggy legacy checkpoint with the current supported map self-heals once after V8 restore',async()=>{
 const h=await harness();const initial=h.discovery.createAuctionGearDiscovery(market([unsupported()]),1000);await advance(h,initial);
 // Exact old completed-stage shape after refresh replaced offers but skipped
 // the already queued item ID: supported maps are new, details were never run.
 const supported=offer(1,20),snapshot=market([supported]),key=auctionVariantKey(supported);
 initial.offers=new Map([[key,[supported]]]);initial.itemVariants=new Map([[1,[key]]]);initial.marketId=snapshot.id;
 initial.discoveredSnapshotId=snapshot.id;initial.unsupportedLotsByItem=new Map();initial.unsupportedModifierLots=0;
 delete initial.supportedSummaryItems;
 const state=deserialize(serialize(initial));assert.equal(h.discovery.auctionGearDiscoveryComplete(state),true);
 h.discovery.refreshAuctionGearDiscovery(state,snapshot,{retryCatalog:false});
 assert.equal(h.discovery.auctionGearDiscoveryComplete(state),false,'Current supported maps do not prove that details ran');
 await advance(h,state);assert.equal(h.discovery.auctionGearDiscoveryOptions(state).length,1);
 const before=h.state.variantCalls;h.discovery.refreshAuctionGearDiscovery(state,snapshot);await advance(h,state);
 assert.equal(h.state.variantCalls,before);assert.equal(state.itemIds.length,1);
});

test('legacy slot-filtered summary is reclassified at most once without expensive work',async()=>{
 const entity=record();entity.highlights=[{key:'inventory_type',value:'Head'}];
 const h=await harness({entity});const state=h.discovery.createAuctionGearDiscovery(market([offer()]),1000);await advance(h,state);
 assert.equal(state.entities.has(1),false);delete state.supportedSummaryItems;
 h.discovery.refreshAuctionGearDiscovery(state,market([offer()]));assert.equal(state.itemCursor,0);await advance(h,state);
 assert.equal(state.supportedSummaryItems.has(1),true);assert.equal(h.state.variantCalls,0);
 for(let i=0;i<3;i++){h.discovery.refreshAuctionGearDiscovery(state,market([offer(1,20+i)]));assert.equal(state.itemCursor,1);await advance(h,state);}
 assert.equal(state.itemIds.length,1);assert.equal(h.state.variantCalls,0);
});

test('a first supported arrival reopens while other variant work is pending, without duplicate positions',async()=>{
 const h=await harness();const state=h.discovery.createAuctionGearDiscovery(market([unsupported()]),1000);await advance(h,state);
 state.variantKeys.push('sold-offline-effect');state.queuedVariants.add('sold-offline-effect');
 assert.equal(h.discovery.auctionGearDiscoveryComplete(state),false);
 for(let i=0;i<3;i++)h.discovery.refreshAuctionGearDiscovery(state,market([offer(1,20)]),{retryCatalog:false});
 assert.equal(state.itemIds.length,1);assert.equal(state.itemCursor,0);
 await advance(h,state);assert.equal(h.discovery.auctionGearDiscoveryOptions(state).length,1);
});

test('first supported arrival retains the known noncombat fast path',async()=>{
 const entity=record();entity.tooltip.blocks[0].class_id=19;
 const h=await harness({entity});const state=h.discovery.createAuctionGearDiscovery(market([unsupported()]),1000);await advance(h,state);
 h.discovery.refreshAuctionGearDiscovery(state,market([offer(1,20)]));await advance(h,state);
 assert.equal(h.discovery.auctionGearDiscoveryOptions(state).length,0);assert.equal(h.state.variantCalls,0);
 assert.equal(state.itemCursor,1);assert.equal(state.entities.has(1),false);
});

test('a previous failed detail attempt keeps its existing retry cooldown',async()=>{
 const h=await harness();const state=h.discovery.createAuctionGearDiscovery(market([unsupported()]),1000);await advance(h,state);
 state.entities.set(1,null);state.catalogMissing.add(1);state.catalogRetryAt.set(1,Date.now()+60_000);
 h.discovery.refreshAuctionGearDiscovery(state,market([offer(1,20)]));await advance(h,state);
 assert.equal(state.itemCursor,1);assert.equal(h.state.variantCalls,0);assert.equal(state.catalogMissing.has(1),true);
});

test('newly reopened batch stays pending on cancellation and completes when retried',async()=>{
 const h=await harness();const state=h.discovery.createAuctionGearDiscovery(market([unsupported()]),1000);await advance(h,state);
 h.discovery.refreshAuctionGearDiscovery(state,market([offer(1,20)]));const controller=new AbortController();
 const pending=advance(h,state,{signal:controller.signal});controller.abort();
 await assert.rejects(pending);assert.equal(state.itemCursor,0);assert.equal(state.supportedSummaryItems?.has(1)??false,false);
 await advance(h,state);assert.equal(h.discovery.auctionGearDiscoveryOptions(state).length,1);
});
