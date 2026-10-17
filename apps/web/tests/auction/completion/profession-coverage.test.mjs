import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {serialize,deserialize} from 'node:v8';
import vm from 'node:vm';
import {strip,market,context} from '../reliability/market-harness.mjs';
import {normalizeGearCandidate} from '../../../lib/wow/gearCandidates.ts';
import {auctionVariantKey} from '../../../lib/wow/auctionItemVariant.ts';
import {supportedAuctionModifiers} from '../../../lib/wow/gearItemModifiers.ts';

// Item191242/class19 and crafted-stat79 mirror the published profession witness;
// Recipe2555/class9/name also mirrors saved published catalog metadata.
// Prices/auction IDs and all control rows are deterministic offline fixtures.
const unsupported=[{type:28,value:2164},{type:29,value:79},{type:38,value:8}];
const offer=(itemId,auctionId=itemId,price=100,modifiers=unsupported)=>({auctionId,itemId,quantity:1,buyoutCopper:price,contextId:0,bonusIds:[],modifiers});
async function setup(rows,offers=rows.map(row=>offer(row.id))) {
 let now=Date.now();class Clock extends Date{static now(){return now;}}
 const state={rows:new Map(rows.map(row=>[row.id,{...row}])),lookups:[],details:[],checkpoints:0,hold:null,fail:false};
 const source=await readFile(new URL('../../../lib/wow/auctionGearDiscovery.ts',import.meta.url),'utf8');
 const record=(row,detail=false)=>{const classId=detail?row.detailClass??row.classId:row.classId;return{id:`offline-${row.id}`,externalId:row.id,type:'item',slug:`offline-${row.id}`,name:row.name??'Offline catalog item',payload:row.payload??{},tooltip:{blocks:classId===undefined?[]:[{type:'item_registry',class_id:classId,subclass_id:4,inventory_type:9}]}};};
 const impossible=()=>{throw Error('Unsupported variants must never reach native/reference work');};
 const d=new vm.Script(strip(source)+'\n;({createAuctionGearDiscovery,advanceAuctionGearDiscovery,refreshAuctionGearDiscovery,auctionGearDiscoveryCoverage})').runInNewContext({Map,Set,Object,Number,JSON,Date:Clock,auctionVariantKey,supportedAuctionModifiers,normalizeGearCandidate,
  lookupGearRecords:async(ids,_locale,itemClass,maxRequired,signal)=>{state.lookups.push([...ids]);assert(ids.length<=500);assert.equal(itemClass,undefined);assert.equal(maxRequired,undefined);if(state.hold)await state.hold;signal.throwIfAborted();if(state.fail)throw Error('offline_catalog_unavailable');return ids.flatMap(id=>{const row=state.rows.get(id);return row&&!row.missingSummary?[record(row)]:[];});},
  gearEntityDetails:async(records,_locale,_sources,signal)=>{state.details.push(records.map(r=>r.externalId));assert(records.length<=8);signal.throwIfAborted();if(state.holdDetails)await state.holdDetails;return records.flatMap(r=>{const row=state.rows.get(r.externalId);return row&&!row.missingDetail?[record(row,true)]:[];});},
  getAuctionItemReferences:impossible,resolveAuctionVariants:impossible,
 });
 const input={locale:'ru_RU',region:'eu',token:'offline-no-secret',spec:'fury-warrior',characterLevel:81,selectedSlots:['WRIST'],context,signal:new AbortController().signal,maxSteps:100,onCheckpoint:()=>state.checkpoints++};
 const discovery=d.createAuctionGearDiscovery(market(offers,now),1000);
 return {d,state,input,discovery,advance:overrides=>d.advanceAuctionGearDiscovery(discovery,{...input,...overrides}),coverage:()=>d.auctionGearDiscoveryCoverage(discovery),refresh:(next=offers)=>d.refreshAuctionGearDiscovery(discovery,market(next,now)),clock:ms=>{now+=ms;}};
}

test('authoritative profession equipment and recipes do not produce unsupported combat-data gaps',async()=>{
 const h=await setup([{id:191242,classId:19,name:'Драконитовая кирка'},{id:2555,classId:9,name:'Рецепт: зелье скорости'},{id:3,payload:{ItemClass:9}}],[offer(191242),offer(2555,2555,100,[]),offer(3)]);await h.advance();
 assert.equal(h.coverage().unsupportedModifierLots,0);assert.equal(h.coverage().dataComplete,true);assert.equal(h.coverage().discoveryComplete,true);assert.equal(h.state.lookups.length,1);assert.equal(h.state.details.length,0);
});
test('unsupported armor and weapons remain unverified without expensive detail/native work',async()=>{
 const h=await setup([{id:1,classId:2},{id:2,classId:4}]);await h.advance();
 assert.equal(h.coverage().unsupportedModifierLots,2);assert.equal(h.coverage().dataComplete,false);assert.equal(h.state.details.length,0);assert.equal(h.coverage().matchedLots,0);
});
test('missing summaries stay unverified, and repaired profession summaries clear after bounded retry',async()=>{
 const h=await setup([{id:1,missingSummary:true,classId:19}]);await h.advance();assert.equal(h.coverage().dataComplete,false);
 h.state.rows.get(1).missingSummary=false;h.refresh();await h.advance();assert.equal(h.state.lookups.length,1);
 h.clock(60_001);h.refresh();await h.advance();assert.equal(h.state.lookups.length,2);assert.equal(h.coverage().unsupportedModifierLots,0);assert.equal(h.coverage().catalogUnmatchedItemIds,0);assert.equal(h.coverage().dataComplete,true);
});
test('missing summary class uses bounded authoritative details solely for classification',async()=>{
 const h=await setup(Array.from({length:9},(_,i)=>({id:i+1,detailClass:19})));await h.advance();
 assert.equal(h.state.details.length,2);assert.equal(h.coverage().unsupportedModifierLots,0);assert.equal(h.coverage().dataComplete,true);
});
test('genuinely missing class/details retain warnings and do not retry every refresh',async()=>{
 for(const missingDetail of [false,true]){const h=await setup([{id:1,missingDetail}]);await h.advance();assert.equal(h.coverage().unsupportedModifierLots,1);assert.equal(h.coverage().dataComplete,false);const before=[h.state.lookups.length,h.state.details.length];h.refresh();await h.advance();assert.deepEqual([h.state.lookups.length,h.state.details.length],before);}
});
test('budget excludes unaffordable unsupported items from classification and data gaps',async()=>{
 const h=await setup([{id:1,classId:19},{id:2,classId:4}],[offer(1),offer(2,2,1001)]);await h.advance();
 assert.deepEqual(h.state.lookups,[[1]]);assert.equal(h.coverage().affordableLots,1);assert.equal(h.coverage().dataComplete,true);
});
test('legacy completed checkpoints reclassify unsupported IDs on refresh without duplicate cursor positions',async()=>{
 const h=await setup([{id:191242,classId:19}]);
 h.discovery.itemIds=[191242];h.discovery.itemCursor=1;h.discovery.queuedItems=new Set([191242]);h.discovery.scannedItems=new Set([191242]);
 delete h.discovery.catalogItemClasses;delete h.discovery.unsupportedLotsByItem;
 assert.equal(h.coverage().dataComplete,false);h.refresh();await h.advance();
 assert.equal(h.coverage().dataComplete,true);assert.equal(h.discovery.itemIds.length,1);assert.equal(h.discovery.queuedItems.size,1);assert.equal(h.state.lookups.length,1);
});
test('classification and count state survives V8 checkpoint replay and lot refresh',async()=>{
 const h=await setup([{id:1,classId:19},{id:2,classId:4}],[offer(1),offer(2)]);await h.advance();
 const restored=deserialize(serialize(h.discovery));h.d.refreshAuctionGearDiscovery(restored,market([offer(1,101),offer(1,102),offer(2,201)]));
 assert.equal(h.d.auctionGearDiscoveryCoverage(restored).unsupportedModifierLots,1);assert.equal(h.d.auctionGearDiscoveryCoverage(restored).dataComplete,false);
 h.d.refreshAuctionGearDiscovery(restored,market([offer(1,101),offer(1,102)]));assert.equal(h.d.auctionGearDiscoveryCoverage(restored).unsupportedModifierLots,0);assert.equal(h.d.auctionGearDiscoveryCoverage(restored).dataComplete,true);
});
test('cancelled and failed classification batches commit no cursor or partial class facts',async()=>{
 for(const failed of [false,true]){const h=await setup([{id:1,classId:19}]);let release;h.state.hold=new Promise(r=>{release=r;});h.state.fail=failed;const controller=new AbortController();const pending=h.advance({signal:controller.signal});if(!failed)controller.abort();release();await assert.rejects(pending);assert.equal(h.discovery.itemCursor,0);assert.equal(h.coverage().unsupportedModifierLots,1);assert.equal(h.state.checkpoints,0);h.state.hold=null;h.state.fail=false;await h.advance();assert.equal(h.coverage().dataComplete,true);}
});

test('missing summary class resolved as combat still warns and never probes unsupported variants',async()=>{
 const h=await setup([{id:1,detailClass:4}]);await h.advance();assert.equal(h.state.details.length,1);assert.equal(h.coverage().unsupportedModifierLots,1);assert.equal(h.coverage().dataComplete,false);
});
test('all unsupported IDs use the existing bounded summary batches without details for known noncombat',async()=>{
 const h=await setup(Array.from({length:501},(_,i)=>({id:i+1,classId:19})));await h.advance();assert.deepEqual(h.state.lookups.map(ids=>ids.length),[500,1]);assert.equal(h.state.details.length,0);assert.equal(h.coverage().dataComplete,true);
});
test('cancellation after classification details resolve preserves the whole pending batch',async()=>{
 const h=await setup([{id:1,detailClass:19}]);await h.advance({maxSteps:1});let release;h.state.holdDetails=new Promise(r=>{release=r;});const controller=new AbortController();const pending=h.advance({signal:controller.signal});controller.abort();release();await assert.rejects(pending);assert.equal(h.discovery.records.length,1);assert.equal(h.coverage().unsupportedModifierLots,1);h.state.holdDetails=null;await h.advance();assert.equal(h.coverage().dataComplete,true);
});
