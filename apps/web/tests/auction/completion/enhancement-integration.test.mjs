import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as planner from '../../../lib/wow/auctionGearPlanner.ts';
import { createAuctionGearDiagnostics, logAuctionGearDiagnostics } from '../../../lib/wow/auctionGearDiagnostics.ts';
import { parseAuctionGearEncounter, parseAuctionGearCompareScenarios } from '../../../lib/wow/auctionGearScenarios.ts';
import { evaluateAuctionGearScenarios } from '../../../lib/wow/auctionGearScenarioExecution.ts';
import { customizedAuctionGearOptions, ownedAuctionGearChanges, applyOwnedAuctionGearChanges } from '../../../lib/wow/auctionGearEnhancedConfiguration.ts';
import { auctionGearProfileFingerprint } from '../../../lib/wow/auctionGearFingerprint.ts';
import { auctionGearVariantSelectionKey } from '../../../lib/wow/auctionGearExclusions.ts';
import { assertFreshMarket } from '../../../lib/wow/auctionMarket.ts';
import { optimizeAuctionGearEnhancements } from '../../../lib/wow/auctionGearEnhancementOptimizer.ts';
import { evaluateAuctionEnhancementStage, auctionEnhancementScenarioFinalists } from '../../../lib/wow/auctionGearEnhancementStage.ts';
import { advanceAuctionGearExhaustiveEnhancements } from '../../../lib/wow/auctionGearExhaustiveEnhancements.ts';
import { auctionSelectionEffectKey } from '../../../lib/wow/auctionGearEffects.ts';
import { auctionEnhancementCatalogInfo, auctionEnhancementRecords, resolveExactEnhancements } from '../../../lib/wow/auctionEnhancementCatalog.ts';
import { prepareGearLoadout, nativeGearSimulationMeasurement } from '../../../lib/wow/gearSimulation.ts';
import { auctionGearMechanicalKey, createAuctionGearMechanicalCache } from '../../../lib/wow/auctionGearMechanicalCache.ts';

// Synthetic rules and quotes, never live catalogue claims. The optimizer,
// equipment preparation and native mechanical cache are production modules.
const gem = { key:'synthetic-gem',kind:'gem',consumableItemId:950001,simulationId:950001 };
const enchant = { key:'synthetic-enchant',kind:'enchant',consumableItemId:950002,simulationId:8501 };
const measurement = dps => ({dps,dpsError:1,confidence:95,iterations:750,engine:'SimulationCraft synthetic-enhancements'});
const timestamp = new Date().toISOString();
const newSlot = (slotType='WRIST', extra={}) => ({slotType,variantKey:`synthetic-${slotType}`,metadataKey:`native-v2-${slotType}`,owned:false,
  sockets:[{key:'socket-0',type:'prismatic'}],...extra});
function fixture(overrides={}) {
  const calls=[];
  const input={slots:[newSlot('WRIST'),newSlot('HEAD')],
    catalog:{version:'synthetic-rules-v1',complete:true,resolve:slot=>({verified:true,enchantApplicable:true,enchantChoices:[enchant],
      gemChoices:Object.fromEntries(slot.sockets.map(socket=>[socket.key,[gem]]))})},character:{},
    prices:{sourceUpdatedAt:timestamp,prices:{[gem.consumableItemId]:{ladder:[[30,1],[40,3]]},[enchant.consumableItemId]:{ladder:[[20,5]]}}},
    itemsCopper:100,budgetCopper:210,simulationIdentity:'synthetic-profile:single-target:120:1',signal:new AbortController().signal,
    limits:{configurations:128,simulations:12,finalists:3},simulate:async config=>{calls.push(structuredClone(config));return measurement(1200);},...overrides};
  return {input,calls};
}
function candidate(slot) {
  return {entityId:`synthetic-${slot.slotType}`,itemId:slot.slotType==='HEAD'?960001:960002,name:'Synthetic replacement',slotType:slot.slotType,
    itemLevel:150,inventoryType:slot.slotType==='HEAD'?1:9,itemClassId:4,itemSubclassId:4,
    constraints:{uniqueEquipped:false,crafted:false,allowableClassMask:'1',requiredLevel:1},
    compatibility:{specId:72,method:'specialization',itemClassId:4,itemSubclassId:4},eligible:true,rejectionReasons:[],
    provenance:{buildId:1},season:{id:'synthetic',patch:'synthetic',status:'current',evidence:'synthetic'},source:{type:'auction',evidence:'synthetic'},
    variants:[{key:slot.variantKey,itemLevel:150,bonusIds:[101],contextId:13}]};
}
function prepare(configuration) {
  const equipment={equipped_items:[{item:{id:970001},slot:{type:'HEAD'}},{item:{id:970002},slot:{type:'WRIST'}}]};
  const loadout=[{slotType:'HEAD',itemId:970001,inventoryType:1,itemSubclassId:4},{slotType:'WRIST',itemId:970002,inventoryType:9,itemSubclassId:4}];
  return prepareGearLoadout({specId:72,equipment,loadout,selections:configuration.slots.map(slot=>({candidate:candidate(slot),variantKey:slot.variantKey,
    customization:{enchantId:slot.enchantId,gemIds:slot.gemIds}}))});
}

test('complete set pays repeated consumables at actual quantity tiers and respects the inclusive total budget',async()=>{
  const {input,calls}=fixture();
  const result=await optimizeAuctionGearEnhancements(input);
  assert.equal(result.complete,true); assert.equal(calls.length,1);
  const full=result.finalists[0].configuration;
  assert.equal(full.totalCopper,210); assert.equal(full.itemsCopper,100);
  assert.deepEqual(full.consumables,[{itemId:950001,kind:'gem',quantity:2,quotedCopper:70,levels:[{unitCopper:30,quantity:1},{unitCopper:40,quantity:1}],missingQuantity:0},{itemId:950002,kind:'enchant',quantity:2,quotedCopper:40,levels:[{unitCopper:20,quantity:2}],missingQuantity:0}]);
  const lower=fixture({budgetCopper:209});
  const rejected=await optimizeAuctionGearEnhancements(lower.input);
  assert.equal(lower.calls.length,0); assert.equal(rejected.finalists.length,0);
  assert(rejected.reasons.includes('over_budget'));
  assert(!rejected.configurations.some(config=>config.fullyEnhanced&&config.status==='priced'));
});

test('unknown prices and insufficient identical-gem stock never become a free or simulated full upgrade',async()=>{
  for(const prices of [{[gem.consumableItemId]:{ladder:[[30,5]]}},
    {[gem.consumableItemId]:{ladder:[[30,1]]},[enchant.consumableItemId]:{ladder:[[20,5]]}}]) {
    const {input,calls}=fixture({prices:{sourceUpdatedAt:timestamp,prices}});
    const result=await optimizeAuctionGearEnhancements(input);
    assert.equal(calls.length,0); assert.equal(result.finalists.length,0);
    assert(result.reasons.includes('price_unknown_or_insufficient_quantity'));
    assert(!result.configurations.some(config=>config.fullyEnhanced&&config.status==='priced'),
      'Pruned incomplete-price configurations must never be certified or simulated');
  }
});

test('shared gem category is checked against retained equipment and owned gems are not credited as inventory',async()=>{
  const uniqueGem={...gem,category:{id:'synthetic-shared-category',limit:1}};
  const ordinary={...gem,key:'synthetic-ordinary',consumableItemId:950003,simulationId:950003};
  const owned=newSlot('FINGER_1',{owned:true,installed:{enchant,gems:[uniqueGem]}});
  const {input,calls}=fixture({slots:[owned,newSlot()],budgetCopper:1000,
    prices:{sourceUpdatedAt:timestamp,prices:{950001:{ladder:[[30,5]]},950002:{ladder:[[20,5]]},950003:{ladder:[[40,5]]}}},
    catalog:{version:'synthetic-category-v1',complete:true,resolve:()=>({verified:true,enchantApplicable:true,enchantChoices:[enchant],gemChoices:{'socket-0':[uniqueGem,ordinary]}})}});
  const result=await optimizeAuctionGearEnhancements(input);
  assert.equal(calls.length,1);
  const best=result.finalists[0].configuration;
  assert.deepEqual(best.slots.find(slot=>slot.slotType==='FINGER_1').gemIds,[950001]);
  assert.deepEqual(best.slots.find(slot=>slot.slotType==='WRIST').gemIds,[950003]);
  assert.deepEqual(best.consumables,[{itemId:950002,kind:'enchant',quantity:1,quotedCopper:20,levels:[{unitCopper:20,quantity:1}],missingQuantity:0},{itemId:950003,kind:'gem',quantity:1,quotedCopper:40,levels:[{unitCopper:40,quantity:1}],missingQuantity:0}]);
  assert.equal(best.totalCopper,160,'Retained improvements cost nothing but cannot pay for another slot');
});

test('unknown character professions do not authorize profession-restricted improvements',async()=>{
  const restricted={...gem,profession:{id:755,rank:100}};
  const make=character=>fixture({slots:[newSlot()],character,
    catalog:{version:'synthetic-profession-v1',complete:true,resolve:()=>({verified:true,enchantApplicable:true,enchantChoices:[enchant],gemChoices:{'socket-0':[restricted]}})}});
  const unknown=make({}); const denied=await optimizeAuctionGearEnhancements(unknown.input);
  assert.equal(unknown.calls.length,0); assert.equal(denied.finalists.length,0);
  const known=make({professions:{755:100}}); const allowed=await optimizeAuctionGearEnhancements(known.input);
  assert.equal(known.calls.length,1); assert.equal(allowed.finalists.length,1);
});

test('real loadout preparation sends precisely the priced gem item IDs and enchant IDs to native input',async()=>{
  const {input}=fixture(); const requests=[];
  input.simulate=async configuration=>{
    const prepared=prepare(configuration); requests.push({configuration:structuredClone(configuration),changes:prepared.changes});
    return measurement(1100+prepared.changes.reduce((sum,change)=>sum+change.gemIds.length*10+Number(Boolean(change.enchantId)),0));
  };
  const result=await optimizeAuctionGearEnhancements(input);
  assert.equal(requests.length,1);
  for(const change of requests[0].changes) {
    assert.equal(change.enchantId,enchant.simulationId);
    assert.deepEqual(change.gemIds,[gem.simulationId]);
    assert.deepEqual(change.bonusIds,[101]); assert.equal(change.contextId,13);
  }
  assert.equal(requests[0].configuration.totalCopper,result.finalists[0].configuration.totalCopper);
  assert.equal(result.finalists[0].simulation.dps,1122);
});

test('actual mechanical cache separates paid customization and encounter identity',async()=>{
  const {input}=fixture(); const result=await optimizeAuctionGearEnhancements(input);
  const changes=prepare(result.finalists[0].configuration).changes;
  const request={spec:'fury-warrior',scenario:'single-target',fightLengthSeconds:120,targets:1,gearChanges:changes};
  const key=auctionGearMechanicalKey('synthetic-profile',request), cache=createAuctionGearMechanicalCache();
  cache.set(key,measurement(1234));
  const changed=structuredClone(request);changed.gearChanges[0].gemIds=[950003];
  const changedEnchant=structuredClone(request);changedEnchant.gearChanges[0].enchantId=8502;
  for(const other of [changed,changedEnchant,{...request,scenario:'aoe',targets:5}]) {
    const otherKey=auctionGearMechanicalKey('synthetic-profile',other);
    assert.notEqual(otherKey,key);assert.equal(cache.get(otherKey,'SimulationCraft synthetic-enhancements'),undefined);
  }
  assert.equal(cache.get(key,'SimulationCraft synthetic-enhancements').dps,1234);
});

test('serialized continuation retains priced finalists and never repeats already simulated configurations',async()=>{
  const second={...gem,key:'synthetic-second-gem',consumableItemId:950003,simulationId:950003};
  const {input,calls}=fixture({slots:[newSlot()],budgetCopper:1000,limits:{configurations:128,simulations:1,finalists:3},
    prices:{sourceUpdatedAt:timestamp,prices:{950001:{ladder:[[30,5]]},950002:{ladder:[[20,5]]},950003:{ladder:[[40,5]]}}},
    catalog:{version:'synthetic-resume-v1',complete:true,resolve:()=>({verified:true,enchantApplicable:true,enchantChoices:[enchant],gemChoices:{'socket-0':[gem,second]}})}});
  let result=await optimizeAuctionGearEnhancements(input);
  assert.equal(result.complete,false); assert.equal(calls.length,1);
  for(let step=0;step<5&&!result.complete;step++) result=await optimizeAuctionGearEnhancements({...input,checkpoint:JSON.parse(JSON.stringify(result.checkpoint))});
  assert.equal(result.complete,true);assert.equal(calls.length,2);
  assert.equal(new Set(calls.map(config=>config.key)).size,2);assert.equal(result.finalists.length,2);
  await optimizeAuctionGearEnhancements({...input,checkpoint:JSON.parse(JSON.stringify(result.checkpoint))});
  assert.equal(calls.length,2);
});

test('quote or rules changes invalidate continuation and stale markets cannot certify a full upgrade',async()=>{
  const {input,calls}=fixture(); const result=await optimizeAuctionGearEnhancements(input);
  for(const changed of [{...input,prices:{...input.prices,prices:{...input.prices.prices,950001:{ladder:[[100,5]]}}}},
    {...input,catalog:{...input.catalog,version:'synthetic-rules-v2'}}, {...input,simulationIdentity:'synthetic-profile:aoe:120:5'}]) {
    await assert.rejects(optimizeAuctionGearEnhancements({...changed,checkpoint:result.checkpoint}),/enhancement_checkpoint_changed/);
  }
  assert.equal(calls.length,1);
  const stale=fixture({prices:{...input.prices,sourceUpdatedAt:'2000-01-01T00:00:00Z'}});
  const old=await optimizeAuctionGearEnhancements(stale.input);
  assert.equal(stale.calls.length,0);assert.equal(old.finalists.length,0);
  assert(old.configurations.some(config=>config.fullyEnhanced&&config.status==='market_unverified'));
});

function stageFixture({verified=true,slotType='TRINKET_1',inventoryType=12,itemSubclassId=0}={}) {
  const variantKey=`synthetic-exact-socketed-${slotType}`;
  const native={status:'verified',socketColors:[14,0,0],socketCount:1,socketBonusId:0,requiredProfessionId:0,requiredProfessionRank:0};
  const trinket={...candidate({slotType,variantKey}),itemId:960010,inventoryType,itemSubclassId,
    compatibility:{specId:72,method:'specialization',itemClassId:4,itemSubclassId},
    variants:[{key:variantKey,itemLevel:150,bonusIds:[101],contextId:13,
      resolution:{engine:'SimulationCraft 18428cd synthetic-transport',stats:{},requiredLevel:1,
        metadataVersion:verified?3:1,...(verified?{enhancements:native}:{})}}]};
  const option={id:'synthetic-trinket-option',auctionId:980010,quantity:1,costCopper:100,candidate:trinket,variantKey};
  const state={checkpoints:{}},calls=[],quotes=[];let quotePrice=10;
  const equipment={equipped_items:[{slot:{type:slotType},item:{id:970010}}]};
  const loadout=[{slotType,itemId:970010,inventoryType,itemSubclassId}];
  const baseline={...measurement(1000),engine:'SimulationCraft 18428cd synthetic-transport'};
  const input={finalists:[{label:'measured',options:[option]}],equipment,loadout,specId:72,level:90,region:'eu',
    engine:baseline.engine,profileFingerprint:'synthetic-exact-stage-profile',encounter:{scenario:'single-target',fightLengthSeconds:120,targets:1},
    budgetCopper:500,objective:'dps',baseline,signal:new AbortController().signal,shouldYield:()=>false,state,
    quote:async(region,ids)=>{
      assert.equal(region,'eu');quotes.push([...ids]);
      return {prices:Object.fromEntries(ids.map(id=>[String(id),{ladder:[[quotePrice,10]]}])),sourceUpdatedAt:timestamp,fetchedAt:new Date().toISOString()};
    },
    simulate:async(options,signal)=>{
      signal.throwIfAborted();
      const prepared=prepareGearLoadout({selections:options,equipment,loadout,specId:72});
      calls.push(structuredClone(prepared.changes));
      const gemIds=prepared.changes.flatMap(change=>change.gemIds??[]);
      assert.equal(gemIds.length,1);assert(quotes.some(ids=>ids.includes(gemIds[0])),'Simulated gem is a quoted catalog item');
      if(slotType==='TRINKET_1')assert.equal(prepared.changes[0].enchantId,undefined,'No invented trinket enchant');
      return {...measurement(1100+gemIds[0]%100),engine:baseline.engine};
    }};
  return {input,calls,quotes,setPrice:value=>{quotePrice=value;}};
}
async function finishStage(h) {
  let result;
  for(let step=0;step<20;step++) {
    result=await evaluateAuctionEnhancementStage(h.input);
    // Exercise the JSON-safe state boundary used by durable continuation.
    h.input.state=JSON.parse(JSON.stringify(h.input.state));
    if(result.complete)return result;
  }
  assert.fail('Bounded stage did not finish within its declared configuration cap');
}

test('actual enhancement stage uses pinned catalog gems and resumes exact priced native configurations without duplication',async()=>{
  const h=stageFixture();
  const result=await finishStage(h);
  assert.equal(result.status,'ready');assert.equal(result.catalogRevision,auctionEnhancementCatalogInfo.revision);
  assert.equal(result.searchLimited,true,'A supported catalog subset is never called globally optimal');
  assert(h.calls.length>0&&h.calls.length<=12);
  assert.equal(new Set(h.calls.map(changes=>JSON.stringify(changes))).size,h.calls.length);
  const best=result.recommendations[0];
  assert.equal(best.configuration.totalCopper,110);
  assert.equal(best.configuration.consumables.length,1);
  assert.equal(best.configuration.consumables[0].quantity,1);
  assert.equal(best.configuration.consumables[0].quotedCopper,10);
  assert.equal(best.configuration.slots[0].gemIds[0],best.configuration.consumables[0].itemId);
  assert(h.calls.some(changes=>changes[0].gemIds[0]===best.configuration.consumables[0].itemId));
  const before=h.calls.length;
  const warm=await evaluateAuctionEnhancementStage(h.input);
  assert.equal(warm.status,'ready');assert.equal(h.calls.length,before);
});

test('actual stage refreshes consumable quotes and invalidates affordability without rerunning cached DPS',async()=>{
  const h=stageFixture();h.input.budgetCopper=115;
  const initial=await finishStage(h);assert.equal(initial.status,'ready');
  const count=h.calls.length;
  h.setPrice(20);h.input.state.quotes.fetchedAt='2000-01-01T00:00:00Z';
  const repriced=await finishStage(h);
  assert.equal(h.quotes.length,2);assert.equal(h.calls.length,count,'Price-only changes must not spend more native calls');
  assert.equal(repriced.recommendations.length,0,'The previous affordable recommendation cannot survive its now-over-budget quote');
  h.setPrice(12);h.input.state.quotes.fetchedAt='2000-01-01T00:00:00Z';
  const affordable=await finishStage(h);
  assert.equal(affordable.status,'ready');assert.equal(affordable.recommendations[0].configuration.totalCopper,112);
  assert.equal(new Set(h.calls.map(changes=>JSON.stringify(changes))).size,h.calls.length,
    'Restored affordability may visit new effects but must never resimulate cached effects');
});

test('stage exposes both checked objectives and migrates legacy checkpoints by replaying existing measurements',async()=>{
  const h=stageFixture();let cheapest;const evaluated=[];
  h.input.objective='value';h.input.includeObjectiveAlternatives=true;
  h.input.quote=async(_region,ids)=>{
    cheapest=ids[0];
    return {prices:{[ids[0]]:{ladder:[[10,10]]},[ids[1]]:{ladder:[[100,10]]}},sourceUpdatedAt:timestamp,fetchedAt:new Date().toISOString()};
  };
  h.input.simulate=async options=>{
    const gem=options[0].customization.gemIds[0];evaluated.push(gem);
    return {...h.input.baseline,dps:gem===cheapest?1100:1150};
  };
  const first=await finishStage(h);
  assert.equal(first.status,'ready');assert.equal(evaluated.length,2);
  assert.deepEqual(first.recommendations.map(row=>[row.comparison.candidateDps,row.configuration.totalCopper]),[[1100,110],[1150,200]]);
  assert.equal(auctionEnhancementScenarioFinalists(first.recommendations,'value').length,2);
  h.input.includeObjectiveAlternatives=false;
  const legacyOutput=await evaluateAuctionEnhancementStage(h.input);
  assert.equal(legacyOutput.recommendations.length,1);assert.equal(legacyOutput.recommendations[0].simulation.dps,1100);
  h.input.includeObjectiveAlternatives=true;
  for(const checkpoint of Object.values(h.input.state.checkpoints)) {
    checkpoint.inputKey='legacy-objective-only-traversal';
    delete checkpoint.bestValueConfirmed;delete checkpoint.bestDpsConfirmed;
  }
  const migrated=await finishStage(h);
  assert.deepEqual(migrated.recommendations.map(row=>row.simulation.dps),[1100,1150]);
  assert.equal(evaluated.length,2,'Legacy replay and both-objective retention reuse exact native measurements');
});

test('actual stage does not quote or certify legacy metadata without exact native socket verification',async()=>{
  const h=stageFixture({verified:false});
  const result=await evaluateAuctionEnhancementStage(h.input);
  assert.equal(result.status,'unavailable');assert(result.reasons.includes('variant_enhancements_unknown'));
  assert.equal(result.recommendations.length,0);assert.equal(h.quotes.length,0);assert.equal(h.calls.length,0);
});

test('many enhancement axes produce a useful full configuration in the first bounded slice',async()=>{
  const slots=['HEAD','NECK','WRIST','WAIST','FINGER_1','FINGER_2'].map(slotType=>newSlot(slotType,
    {sockets:[{key:'socket-0',type:'prismatic'},{key:'socket-1',type:'prismatic'}]}));
  const {input,calls}=fixture({slots,budgetCopper:100000,limits:{configurations:128,simulations:1,finalists:3},
    prices:{sourceUpdatedAt:timestamp,prices:{950001:{ladder:[[10,100]]},950002:{ladder:[[20,100]]}}}});
  const first=await optimizeAuctionGearEnhancements(input);
  assert.equal(calls.length,1,'Filled choices must precede the exponentially large bare-configuration prefix');
  assert.equal(first.finalists.length,1);assert.equal(first.finalists[0].configuration.fullyEnhanced,true);
});

test('actual stage prices a supported leg enchant and gem together and sends their mapped native IDs',async()=>{
  const h=stageFixture({slotType:'LEGS',inventoryType:7,itemSubclassId:4});
  const result=await finishStage(h);
  assert.equal(result.status,'ready');
  const best=result.recommendations[0].configuration;
  assert.equal(best.totalCopper,120,'Item100 + quoted gem10 + quoted enchant10');
  assert.equal(best.consumables.length,2);
  const paidGem=best.consumables.find(row=>row.kind==='gem');
  const paidEnchant=best.consumables.find(row=>row.kind==='enchant');
  assert(paidGem&&paidEnchant);
  assert(h.quotes.some(ids=>ids.includes(paidGem.itemId)&&ids.includes(paidEnchant.itemId)));
  assert.equal(best.slots[0].gemIds[0],paidGem.itemId);
  assert(best.slots[0].enchantId>0);
  assert.notEqual(best.slots[0].enchantId,paidEnchant.itemId,'Native enchant ID must be resolved, not copied from auction consumable ID');
  assert(h.calls.some(changes=>changes[0].slot==='legs'&&changes[0].enchantId===best.slots[0].enchantId&&changes[0].gemIds[0]===paidGem.itemId));
});

for (const fixtureCase of ['winning bare set','two unverified bare leaders must not hide third verified loser','socket loser beats an existing bare winner only with a gem','late two-slot synergy beats both initial bare leaders','socket loser with live capacity two then downgrade']) test(`actual Runner continues priced finalists and scenario comparisons (${fixtureCase})`,async()=>{
  const bareLoserFallback=fixtureCase.startsWith('two unverified'), socketLoser=fixtureCase.startsWith('socket loser'), synergy=fixtureCase.startsWith('late two-slot');
  const capacityDowngrade=fixtureCase.includes('live capacity');
  const h=stageFixture({slotType:'LEGS',inventoryType:7,itemSubclassId:4});
  if(bareLoserFallback){
    const verified=h.input.finalists[0].options[0];
    const unverified=[1,2].map(index=>{
      const option=structuredClone(verified);option.id=`unverified-${index}`;option.auctionId+=index;
      option.candidate.itemId+=index;option.variantKey=`unverified-variant-${index}`;
      option.candidate.variants[0].key=option.variantKey;
      option.candidate.variants[0].resolution.metadataVersion=1;
      delete option.candidate.variants[0].resolution.enhancements;
      return option;
    });
    h.input.finalists[0].options.unshift(...unverified);
  }
  if(socketLoser) {
    // Fixed market inventory keeps the continuation fixture independent of
    // how many historical, unlisted consumables enter the pinned catalog.
    const stocked=new Set([173121,173122,173123,173124,240094,240133,244643]);
    h.input.quote=async(_region,ids)=>({
      prices:Object.fromEntries(ids.filter(id=>stocked.has(id)).map(id=>[id,{ladder:[[10,10]]}])),
      sourceUpdatedAt:timestamp,fetchedAt:new Date().toISOString(),
    });
    const bareWinner=structuredClone(h.input.finalists[0].options[0]);
    bareWinner.id='synthetic-bare-winner';bareWinner.auctionId++;bareWinner.candidate.itemId++;
    bareWinner.variantKey='synthetic-no-socket';bareWinner.candidate.variants[0].key=bareWinner.variantKey;
    Object.assign(bareWinner.candidate.variants[0].resolution.enhancements,{socketColors:[0,0,0],socketCount:0});
    h.input.finalists[0].options.unshift(bareWinner);
  }
  if(synergy) {
    const original=h.input.finalists[0].options[0];
    const leaders=[1,2].map(index=>{const row=structuredClone(original);row.id=`early-${index}`;row.auctionId+=index;row.candidate.itemId+=index;return row;});
    const partner=stageFixture().input.finalists[0].options[0];partner.id='z-synergy-partner';partner.auctionId=980020;partner.candidate.itemId=960020;
    h.input.finalists[0].options=[...leaders,original,partner];
    h.input.loadout.push({slotType:'TRINKET_1',itemId:970020,inventoryType:12,itemSubclassId:0});
    h.input.equipment.equipped_items.push({slot:{type:'TRINKET_1'},item:{id:970020}});
    const pricedGem=auctionEnhancementRecords.find(row=>row.kind==='gem'&&row.consumableItemId>0).consumableItemId;
    h.input.quote=async(_region,ids)=>({prices:Object.fromEntries(ids.filter(id=>id===pricedGem).map(id=>[String(id),{ladder:[[10,100]]}])),sourceUpdatedAt:timestamp,fetchedAt:new Date().toISOString()});
  }
  const requests=[],publications=[],stageOutputs=[],stageCapacities=[],stagePeaks=[];let flushes=0,healthProbes=0,inFlight=0,stagePeak=0;
  const runnerSource=await readFile(new URL('../../../lib/wow/auctionGearRunner.ts',import.meta.url),'utf8');
  const code=stripTypeScriptTypes(runnerSource,{mode:'strip'}).replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
  const nativeEngine=h.input.engine;
  const runner=new vm.Script(code+'\n;({assembleAuctionGearSearch,createAuctionSimulator})').runInNewContext({
    ...planner,createAuctionGearDiagnostics,logAuctionGearDiagnostics,parseAuctionGearEncounter,parseAuctionGearCompareScenarios,
    evaluateAuctionGearScenarios,customizedAuctionGearOptions,ownedAuctionGearChanges,applyOwnedAuctionGearChanges,prepareGearLoadout,nativeGearSimulationMeasurement,
    auctionSelectionEffectKey,auctionEnhancementScenarioFinalists,
    advanceAuctionGearExhaustiveEnhancements:async input=>{
      stageCapacities.push(input.simulationConcurrency);stagePeak=0;const before=requests.length;
      const result=await advanceAuctionGearExhaustiveEnhancements({...input,quote:h.input.quote});
      assert(requests.length-before<=8,'Exact enhancement continuation retains its total eight-native budget');
      stagePeaks.push(stagePeak);stageOutputs.push(result.result);return result;
    },
    auctionGearProfileFingerprint,auctionGearVariantSelectionKey,auctionGearMechanicalKey,
    auctionGearMechanicalCache:createAuctionGearMechanicalCache(),assertFreshMarket,
    Map,Set,Object,Number,JSON,Date,AbortSignal,process,
    scheduleAuctionGearSearchSave:()=>{},flushAuctionGearSearch:async()=>{flushes++;},flushPendingAuctionGearSearch:async()=>{flushes++;},
    evaluateAuctionEnhancementStage:async input=>{
      if(bareLoserFallback) assert(input.finalists.every(finalist=>finalist.options.every(option=>option.id==='synthetic-trinket-option')),'Only the third, verified bare loser may reach the real enhancement stage');
      const result=await evaluateAuctionEnhancementStage({...input,quote:h.input.quote});stageOutputs.push(result);return result;
    },
    fetch:async(url,options)=>{
      if(capacityDowngrade && new URL(url).pathname.endsWith('/healthz')) {
        const capacity=healthProbes++===0?'2':'1';
        return new Response(null,{headers:{'x-gildra-simulation-concurrency':capacity}});
      }
      assert(new URL(url).pathname.endsWith('/v1/wow/rotation/simulations'));
      if(capacityDowngrade){stagePeak=Math.max(stagePeak,++inFlight);await new Promise(resolve=>setImmediate(resolve));inFlight--;}

      const request=JSON.parse(options.body);requests.push(request);
      assert.equal(request.actionListMode,'native');
      const changes=request.gearChanges??[];
      let dps=(1000+changes.reduce((sum,change)=>sum+(bareLoserFallback?(change.itemId===960010?-30:change.itemId===960011?-10:-20):socketLoser&&change.itemId===960010?-10:100)+(change.gemIds?.length?300:0)+(change.enchantId?50:0),0))*request.targets;
      if(synergy) {
        const bare={960010:-20,960011:100,960012:80,960020:-30};
        const both=changes.some(c=>c.itemId===960010&&c.gemIds?.some(Boolean))&&changes.some(c=>c.itemId===960020&&c.gemIds?.some(Boolean));
        dps=(1000+changes.reduce((sum,c)=>sum+(bare[c.itemId]??0)+(c.gemIds?.some(Boolean)?10:0),0)+(both?600:0))*request.targets;
      }
      return Response.json({dps,dpsMean:dps,dpsError:1,confidence:95,iterations:request.precision==='finalist'?3000:750,engine:nativeEngine},
        {headers:{'x-gildra-engine':'simulationcraft'}});
    },
  });
  const armory={equipment:h.input.equipment,profile:{level:90,character_class:{id:1},race:{id:1}},specializations:{},activeSpecializationId:72,activeTalentLoadout:'synthetic-runner-talents'};
  const market={sourceUpdatedAt:timestamp};
  const encounter={fightLengthSeconds:120,targets:1};
  const options=h.input.finalists[0].options;
  const context={input:{scenario:'single-target',locale:'en',selectedSlots:synergy?['LEGS','TRINKET_1']:['LEGS'],budgetCopper:500,objective:'dps',
    ...(socketLoser||synergy?{enhancementMode:'enhanced'}:{}),
    compareScenarios:[{scenario:'aoe',fightLengthSeconds:90,targets:3}]},
    options,armory,loadout:h.input.loadout,specId:72,specSlug:'fury-warrior',market,encounter,
    character:{level:90,region:'eu'},currentBySlot:new Map(),coverage:{discoveryComplete:true,dataComplete:true},searchLimited:false,
    profileFingerprint:auctionGearProfileFingerprint(armory),publicMarket:{snapshotId:'synthetic-runner-market'},marketChange:{}};
  context.simulate=runner.createAuctionSimulator({armory,loadout:context.loadout,specId:72,specSlug:'fury-warrior',scenario:'single-target',encounter,market,engine:()=>nativeEngine});
  const signal=new AbortController().signal;
  const seeded=await planner.searchAuctionGearOptions({searchId:'synthetic-enhancement-runner',budgetCopper:500,options,
    selectedSlots:context.input.selectedSlots,loadout:context.loadout,specId:72,market,signal,simulate:context.simulate,maxNewSimulations:8});
  if(socketLoser) {
    const losing=seeded.result.items.find(row=>row.optionId==='synthetic-trinket-option');
    assert.equal(losing.comparison.candidateDps,990);assert(losing.comparison.deltaDps<0);
  }
  const entry={id:'synthetic-enhancement-runner',owner:'synthetic-owner',context,knownOptionIds:new Set(options.map(option=>option.id)),
    searchCheckpoint:seeded.checkpoint,retainedBaseline:seeded.checkpoint.baseline,latestSearchResult:seeded.result};
  const run=()=>runner.assembleAuctionGearSearch(entry,undefined,signal,()=>{},undefined,result=>publications.push(result));
  let result=await run();
  assert.equal(result.exhaustiveComplete,true);
  assert.equal(result.enhancementOptimization.complete,false);
  assert.equal(result.enhancementOptimization.status,'pending');
  assert.equal(result.scenarioComparisonsComplete,false);
  assert.equal(requests.filter(request=>request.targets===3).length,0,'Extra encounters must wait for the priced enhanced finalist');
  const firstPending=result;
  if(synergy) entry.exhaustiveEnhancementState=structuredClone(entry.exhaustiveEnhancementState);
  for(let step=0;step<300&&(!result.enhancementOptimization.complete||!result.scenarioComparisonsComplete);step++) result=await run();
  assert.equal(result.enhancementOptimization.status,'ready');assert.equal(result.enhancementOptimization.complete,true);
  assert.equal(result.scenarioComparisonsComplete,true);assert.equal(firstPending.enhancementOptimization.complete,false,'Previously published result is immutable');
  assert(stageOutputs.length>1);assert(flushes>stageOutputs.length);
  if(capacityDowngrade) {
    assert(healthProbes>1,'Each continuation must probe live worker capacity');
    assert.equal(stageCapacities[0],2);assert(stageCapacities.slice(1).every(capacity=>capacity===1));
    assert.equal(stagePeaks[0],2,'Actual Runner starts independent enhancement native requests together');
    assert(stagePeaks.slice(1).every(peak=>peak<=1),'Downgrade applies on the next continuation without restore');
  }
  const recommendation=socketLoser ? result.enhancementOptimization.recommendations.find(row=>row.optionIds.includes('synthetic-trinket-option')) : result.enhancementOptimization.recommendations[0];
  if(socketLoser) {
    assert.deepEqual(Array.from(result.purchases,row=>row.itemId),[960011],'Bare assembly still selects the genuinely better unmodified item');
    assert(recommendation,'Previously excluded socket item must be evaluated while the bare winner exists');
    assert.equal(recommendation.comparison.candidateDps,1340);
    assert.equal(recommendation.configuration.totalCopper,120);
    assert(recommendation.comparison.uncertainty.significant);
    assert.equal(result.enhancementOptimization.searchLimited,true);
    assert.equal(result.enhancementOptimization.traversal,'exhaustive');
    assert(!result.enhancementOptimization.reasons.includes('socket_candidate_subset'));
    assert(result.enhancementOptimization.recommendations.every(row=>row.configuration.totalCopper<=500));
  }
  if(synergy) {
    assert.deepEqual(Array.from(result.purchases,row=>row.itemId),[960011]);
    assert.deepEqual([...recommendation.optionIds].sort(),['synthetic-trinket-option','z-synergy-partner']);
    assert.equal(recommendation.comparison.candidateDps,1570);
    assert.equal(recommendation.configuration.totalCopper,220);
    assert.equal(result.enhancementOptimization.equipmentChecked,8,'All legal 4x2 equipment choices, including equipped baseline, were completed');
    assert.equal(result.enhancementOptimization.traversal,'exhaustive');
    assert(Object.keys(entry.exhaustiveEnhancementState.stage.checkpoints).length===0);
  }
  const paid=recommendation.configuration.slots.find(slot=>slot.slotType==='LEGS');
  const scenario=result.scenarioComparisons[0];
  assert(scenario.candidates.every(candidate=>candidate.finalist.startsWith('enhanced-')));
  const scenarioRequests=requests.filter(request=>request.targets===3);
  assert.equal(scenarioRequests.length,2,'One scenario-specific baseline and one enhanced finalist');
  assert.equal(scenarioRequests[0].gearChanges,undefined);
  assert.deepEqual(scenarioRequests[1].gearChanges[0].gemIds,paid.gemIds);
  assert.equal(scenarioRequests[1].gearChanges[0].enchantId ?? 0,paid.enchantId);
  const nativeKeys=requests.map(request=>JSON.stringify([request.scenario,request.fightLengthSeconds,request.targets,request.gearChanges??[],request.precision??"ordinary"]));
  assert.equal(new Set(nativeKeys).size,nativeKeys.length,'Continuation must never duplicate a measurement at the same precision');
  if (socketLoser && !synergy) {
    const rechecked=requests.filter(request=>request.precision==='finalist');
    assert.equal(rechecked.length,3,'All three competitive loadouts receive higher precision');
    assert.equal(result.enhancementOptimization.finalistRecheck.significant,false);
    for (const key of result.enhancementOptimization.finalistRecheck.keys) {
      assert.equal(result.enhancementOptimization.recommendations.find(row=>row.configuration.key===key).simulation.iterations,3000);
    }
  }
  assert(publications.some(result=>result.enhancementOptimization?.status==='pending'));
});

test('over-budget enhancement stage with preserved owned equipment reports no affordable configuration',async()=>{
  const h=stageFixture();h.input.budgetCopper=105;
  h.input.equipment.equipped_items.push({slot:{type:'HEAD'},item:{id:970020}});
  h.input.loadout.push({slotType:'HEAD',itemId:970020,inventoryType:1,itemSubclassId:4});
  const result=await finishStage(h);
  assert.equal(result.complete,true);assert.equal(result.recommendations.length,0);
  assert.equal(result.status,'no_affordable_configuration','Owned-equipment preservation is not an unavailable-data error');
  assert(result.reasons.includes('owned_equipment_preserved'));
  assert.equal(h.calls.length,0);
});

test('actual head and ring stage quotes all pinned consumables and resumes within the full equipment budget',async()=>{
  const h=stageFixture({slotType:'HEAD',inventoryType:1,itemSubclassId:4});
  const ring=stageFixture({slotType:'FINGER_1',inventoryType:11,itemSubclassId:0});
  const ringOption=ring.input.finalists[0].options[0];
  ringOption.id='synthetic-ring-option';ringOption.auctionId=980011;ringOption.candidate.itemId=960011;
  ring.input.equipment.equipped_items[0].item.id=970011;ring.input.loadout[0].itemId=970011;
  h.input.finalists[0].options.push(ringOption);
  h.input.equipment.equipped_items.push(...ring.input.equipment.equipped_items);
  h.input.loadout.push(...ring.input.loadout);
  h.input.budgetCopper=240;
  h.input.simulate=async(options,signal)=>{
    signal.throwIfAborted();
    const prepared=prepareGearLoadout({selections:options,equipment:h.input.equipment,loadout:h.input.loadout,specId:72});
    h.calls.push(structuredClone(prepared.changes));
    assert.equal(prepared.changes.length,2);
    for(const change of prepared.changes){assert(change.enchantId>0);assert.equal(change.gemIds.length,1);}
    return {...measurement(1300+prepared.changes.reduce((sum,change)=>sum+change.gemIds[0]%100,0)),engine:h.input.engine};
  };
  const first=await evaluateAuctionEnhancementStage(h.input);
  assert.equal(first.status,'pending');assert.equal(first.complete,false);
  assert.equal(h.quotes.length,1);
  assert.equal(h.quotes[0].length,368,'302 gem IDs + 12 helm enchant items + 54 ring enchant items');
  const expected = new Set();
  for (const {candidate} of h.input.finalists[0].options) {
    const variant = candidate.variants[0];
    const eligible = resolveExactEnhancements({...candidate,itemLevel:variant.itemLevel,socketColors:variant.resolution.enhancements.socketColors,
      build:auctionEnhancementCatalogInfo.build,revision:auctionEnhancementCatalogInfo.simcRevision,engine:h.input.engine},{level:h.input.level});
    assert(eligible.verified);
    for (const row of [...eligible.enchantChoices,...Object.values(eligible.gemChoices).flat()]) expected.add(row.consumableItemId);
  }
  assert.deepEqual(new Set(h.quotes[0]),expected);
  assert(!first.reasons.includes('enhancement_catalog_limit'));
  const final=await finishStage(h);
  assert.equal(final.status,'ready');assert.equal(final.complete,true);
  assert.equal(h.quotes.length,1,'One full snapshot quote is retained across enhancement continuations');
  assert(h.calls.length>1&&h.calls.length<=12);
  assert.equal(new Set(h.calls.map(changes=>JSON.stringify(changes))).size,h.calls.length);
  const config=final.recommendations[0].configuration;
  assert.equal(config.itemsCopper,200);assert.equal(config.totalCopper,240);
  assert.equal(config.consumables.filter(row=>row.kind==='gem').reduce((n,row)=>n+row.quantity,0),2);
  assert.equal(config.consumables.filter(row=>row.kind==='enchant').reduce((n,row)=>n+row.quantity,0),2);
  assert(config.consumables.every(row=>h.quotes[0].includes(row.itemId)));
  for(const slot of config.slots){assert(slot.enchantId>0);assert.equal(slot.gemIds.length,1);}
});

test('missing scroll mappings and unpriced low-level gems retain bare, socketed and other-slot purchases in exact mode',async()=>{
  const h=stageFixture({slotType:'WAIST',inventoryType:6,itemSubclassId:4});
  const belt=h.input.finalists[0].options[0];
  belt.candidate.variants[0].itemLevel=210;
  const trinket=stageFixture();
  const ring=stageFixture({slotType:'FINGER_1',inventoryType:11,itemSubclassId:0});
  const tiny=trinket.input.finalists[0].options[0], finger=ring.input.finalists[0].options[0];
  tiny.candidate.variants[0].itemLevel=8;
  Object.assign(finger.candidate.variants[0].resolution.enhancements,{socketColors:[0,0,0],socketCount:0});
  for(const [index,extra] of [trinket,ring].entries()){
    const option=extra.input.finalists[0].options[0];
    option.id=option.candidate.slotType;option.auctionId+=index+1;option.candidate.itemId+=index+1;
    h.input.finalists[0].options.push(option);
    h.input.loadout.push(...extra.input.loadout);
    h.input.equipment.equipped_items.push(...extra.input.equipment.equipped_items);
  }
  h.input.exhaustive=true;
  const gemId=173121;
  const scroll=auctionEnhancementRecords.find(row=>row.kind==='enchant' && row.inventoryMask===2**11 && row.minItemLevel===120 && !row.restrictionReason);
  const seen=new Set();
  h.input.quote=async(_region,ids)=>{
    assert(ids.includes(scroll.consumableItemId) && ids.includes(gemId));
    return {prices:{[gemId]:{ladder:[[10,1]]},[scroll.consumableItemId]:{ladder:[[15,1]]}},sourceUpdatedAt:timestamp,fetchedAt:timestamp};
  };
  h.input.simulate=async options=>{
    const [waist,small,ring]=options.map(option=>option.customization);
    assert.equal(waist.enchantId,undefined);
    assert.deepEqual(small,{});
    assert.equal(ring.gemIds,undefined);
    const gem=waist.gemIds?.[0]??0, enchant=ring.enchantId??0;
    seen.add(JSON.stringify([gem,enchant]));
    return {...measurement(1100+Number(Boolean(gem))*10+Number(Boolean(enchant))*20),engine:h.input.engine};
  };
  const result=await finishStage(h);
  assert.deepEqual(seen,new Set([[0,0],[gemId,0],[0,scroll.simulationId],[gemId,scroll.simulationId]].map(ids=>JSON.stringify(ids))));
  assert(result.reasons.includes('no_supported_enchant') && result.reasons.includes('price_unknown_or_insufficient_quantity'));
  const best=result.recommendations[0].configuration;
  assert.equal(best.fullyEnhanced,false);
  assert.deepEqual(best.slots.find(slot=>slot.slotType==='TRINKET_1').gemIds,[0]);
  assert.equal(best.totalCopper,325);
});

test('exact completed equipment retains measured effects across restart and reopens gains from missing or unaffordable gems',async()=>{
  const h=stageFixture(), calls=[];
  const gems=auctionEnhancementRecords.filter(r=>r.kind==='gem' && r.consumableItemId && r.color===14 && !r.restrictionReason && !r.profession && !r.category).slice(0,2);
  assert.equal(gems.length,2);
  const [a,b]=gems.map(r=>r.consumableItemId);
  let prices={[a]:{ladder:[[5,10]]}},state;
  const input={...h.input,options:h.input.finalists[0].options,selectedSlots:['TRINKET_1'],budgetCopper:120,
    onState:s=>{state=s;}, quote:async()=>({prices,sourceUpdatedAt:timestamp,fetchedAt:new Date().toISOString()}),
    simulate:async(opts)=>{
      const gem=opts[0]?.customization?.gemIds?.[0]??0;
      calls.push([opts.length,gem]);return {...h.input.baseline,dps:1000+(opts.length?10:0)+(gem===a?20:gem===b?40:0)};
    }};
  const finish=async()=>{
    for(let i=0;i<50;i++){
      const {result}=await advanceAuctionGearExhaustiveEnhancements({...input,state});
      state=JSON.parse(JSON.stringify(state));
      if(result.complete)return result;
    }
    assert.fail('Exact equipment replay did not complete');
  };
  assert.equal((await finish()).recommendations[0].configuration.totalCopper,105);
  const first=calls.length;
  prices={[a]:{ladder:[[30,1]]},[b]:{ladder:[[7,1]]}};
  state.stage.quotes.fetchedAt='2000-01-01T00:00:00Z';
  const second=await finish();
  assert.equal(second.recommendations[0].configuration.totalCopper,107);
  assert.deepEqual(calls.slice(first),[[1,b]]);
  prices={[a]:{ladder:[[9,1]]}};
  state.stage.quotes.fetchedAt='2000-01-01T00:00:00Z';
  assert.equal((await finish()).recommendations[0].configuration.totalCopper,109);
  assert.equal(calls.length,first+1);
});
