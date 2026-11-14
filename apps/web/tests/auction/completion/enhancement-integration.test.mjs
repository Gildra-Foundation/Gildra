import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as planner from '../../../lib/wow/auctionGearPlanner.ts';
import { createAuctionGearDiagnostics, logAuctionGearDiagnostics } from '../../../lib/wow/auctionGearDiagnostics.ts';
import { parseAuctionGearEncounter, parseAuctionGearCompareScenarios } from '../../../lib/wow/auctionGearScenarios.ts';
import { evaluateAuctionGearScenarios } from '../../../lib/wow/auctionGearScenarioExecution.ts';
import { customizedAuctionGearOptions } from '../../../lib/wow/auctionGearEnhancedConfiguration.ts';
import { auctionGearProfileFingerprint } from '../../../lib/wow/auctionGearFingerprint.ts';
import { auctionGearVariantSelectionKey } from '../../../lib/wow/auctionGearExclusions.ts';
import { assertFreshMarket } from '../../../lib/wow/auctionMarket.ts';
import { optimizeAuctionGearEnhancements } from '../../../lib/wow/auctionGearEnhancementOptimizer.ts';
import { evaluateAuctionEnhancementStage } from '../../../lib/wow/auctionGearEnhancementStage.ts';
import { auctionEnhancementCatalogInfo } from '../../../lib/wow/auctionEnhancementCatalog.ts';
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
        metadataVersion:verified?2:1,...(verified?{enhancements:native}:{})}}]};
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

for (const bareLoserFallback of [false,true]) test(`actual Runner continues priced finalists and scenario comparisons (${bareLoserFallback?'two unverified bare leaders must not hide third verified loser':'winning bare set'})`,async()=>{
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
  const requests=[],publications=[],stageOutputs=[];let flushes=0;
  const runnerSource=await readFile(new URL('../../../lib/wow/auctionGearRunner.ts',import.meta.url),'utf8');
  const code=stripTypeScriptTypes(runnerSource,{mode:'strip'}).replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
  const nativeEngine=h.input.engine;
  const runner=new vm.Script(code+'\n;({assembleAuctionGearSearch,createAuctionSimulator})').runInNewContext({
    ...planner,createAuctionGearDiagnostics,logAuctionGearDiagnostics,parseAuctionGearEncounter,parseAuctionGearCompareScenarios,
    evaluateAuctionGearScenarios,customizedAuctionGearOptions,prepareGearLoadout,nativeGearSimulationMeasurement,
    auctionGearProfileFingerprint,auctionGearVariantSelectionKey,auctionGearMechanicalKey,
    auctionGearMechanicalCache:createAuctionGearMechanicalCache(),assertFreshMarket,
    Map,Set,Object,Number,JSON,Date,AbortSignal,process,
    scheduleAuctionGearSearchSave:()=>{},flushAuctionGearSearch:async()=>{flushes++;},
    evaluateAuctionEnhancementStage:async input=>{
      if(bareLoserFallback) assert(input.finalists.every(finalist=>finalist.options.every(option=>option.id==='synthetic-trinket-option')),'Only the third, verified bare loser may reach the real enhancement stage');
      const result=await evaluateAuctionEnhancementStage({...input,quote:h.input.quote});stageOutputs.push(result);return result;
    },
    fetch:async(url,options)=>{
      assert(new URL(url).pathname.endsWith('/v1/wow/rotation/simulations'));
      const request=JSON.parse(options.body);requests.push(request);
      assert.equal(request.actionListMode,'native');
      const changes=request.gearChanges??[];
      const dps=(1000+changes.reduce((sum,change)=>sum+(bareLoserFallback?(change.itemId===960010?-30:change.itemId===960011?-10:-20):100)+(change.gemIds?.length?300:0)+(change.enchantId?50:0),0))*request.targets;
      return Response.json({dps,dpsMean:dps,dpsError:1,confidence:95,iterations:750,engine:nativeEngine},
        {headers:{'x-gildra-engine':'simulationcraft'}});
    },
  });
  const armory={equipment:h.input.equipment,profile:{level:90,character_class:{id:1},race:{id:1}},specializations:{},activeSpecializationId:72,activeTalentLoadout:'synthetic-runner-talents'};
  const market={sourceUpdatedAt:timestamp};
  const encounter={fightLengthSeconds:120,targets:1};
  const options=h.input.finalists[0].options;
  const context={input:{scenario:'single-target',locale:'en',selectedSlots:['LEGS'],budgetCopper:500,objective:'dps',
    compareScenarios:[{scenario:'aoe',fightLengthSeconds:90,targets:3}]},
    options,armory,loadout:h.input.loadout,specId:72,specSlug:'fury-warrior',market,encounter,
    character:{level:90,region:'eu'},currentBySlot:new Map(),coverage:{discoveryComplete:true,dataComplete:true},searchLimited:false,
    profileFingerprint:auctionGearProfileFingerprint(armory),publicMarket:{snapshotId:'synthetic-runner-market'},marketChange:{}};
  context.simulate=runner.createAuctionSimulator({armory,loadout:context.loadout,specId:72,specSlug:'fury-warrior',scenario:'single-target',encounter,market,engine:()=>nativeEngine});
  const signal=new AbortController().signal;
  const seeded=await planner.searchAuctionGearOptions({searchId:'synthetic-enhancement-runner',budgetCopper:500,options,
    selectedSlots:['LEGS'],loadout:context.loadout,specId:72,market,signal,simulate:context.simulate,maxNewSimulations:8});
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
  for(let step=0;step<30&&(!result.enhancementOptimization.complete||!result.scenarioComparisonsComplete);step++) result=await run();
  assert.equal(result.enhancementOptimization.status,'ready');assert.equal(result.enhancementOptimization.complete,true);
  assert.equal(result.scenarioComparisonsComplete,true);assert.equal(firstPending.enhancementOptimization.complete,false,'Previously published result is immutable');
  assert(stageOutputs.length>1);assert(flushes>stageOutputs.length);
  const recommendation=result.enhancementOptimization.recommendations[0];
  const paid=recommendation.configuration.slots.find(slot=>slot.slotType==='LEGS');
  const scenario=result.scenarioComparisons[0];
  assert(scenario.candidates.every(candidate=>candidate.finalist.startsWith('enhanced-')));
  const scenarioRequests=requests.filter(request=>request.targets===3);
  assert.equal(scenarioRequests.length,2,'One scenario-specific baseline and one enhanced finalist');
  assert.equal(scenarioRequests[0].gearChanges,undefined);
  assert.deepEqual(scenarioRequests[1].gearChanges[0].gemIds,paid.gemIds);
  assert.equal(scenarioRequests[1].gearChanges[0].enchantId,paid.enchantId);
  const nativeKeys=requests.map(request=>JSON.stringify([request.scenario,request.fightLengthSeconds,request.targets,request.gearChanges??[]]));
  assert.equal(new Set(nativeKeys).size,nativeKeys.length,'Continuation must not rerun existing native configurations');
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

test('actual head and ring stage quotes all 105 pinned consumables and resumes within the full equipment budget',async()=>{
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
  assert.equal(h.quotes[0].length,105,'75 gem IDs + 12 helm enchant items + 18 ring enchant items');
  assert.equal(new Set(h.quotes[0]).size,105);
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
