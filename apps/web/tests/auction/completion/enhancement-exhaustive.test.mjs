// Synthetic algorithm fixtures, never live DPS/market claims.
import assert from 'node:assert/strict';
import test from 'node:test';
import { optimizeAuctionGearEnhancements } from '../../../lib/wow/auctionGearEnhancementOptimizer.ts';
import { MARKET_MAX_AGE_MS } from '../../../lib/wow/auctionMarket.ts';
import { evaluateAuctionEnhancementStage } from '../../../lib/wow/auctionGearEnhancementStage.ts';
import { auctionEnhancementCatalogInfo } from '../../../lib/wow/auctionEnhancementCatalog.ts';
import { prepareGearLoadout } from '../../../lib/wow/gearSimulation.ts';

const measurement=(dps=1100,dpsError=1)=>({dps,dpsError,confidence:95,iterations:750,engine:'SimulationCraft exhaustive-enhancements'});
const gems=count=>Array.from({length:count},(_,i)=>({key:`gem-${String(i).padStart(3,'0')}`,kind:'gem',consumableItemId:8000+i,simulationId:8000+i}));
function fixture({choices=gems(20),sockets=1,slots=1,...overrides}={}) {
  const calls=[];
  const input={exhaustive:true,slots:Array.from({length:slots},(_,i)=>({slotType:`SLOT_${String(i).padStart(2,'0')}`,variantKey:`variant-${i}`,metadataKey:'verified-synthetic',owned:false,
    sockets:Array.from({length:sockets},(_,i)=>({key:String(i),type:'14'}))})),
    catalog:{version:'synthetic-exact-v1',complete:true,resolve:slot=>({verified:true,enchantApplicable:false,enchantChoices:[],
      gemChoices:Object.fromEntries(slot.sockets.map(socket=>[socket.key,choices]))})},character:{},
    prices:{sourceUpdatedAt:new Date().toISOString(),prices:Object.fromEntries(choices.map(g=>[g.consumableItemId,{ladder:[[1,1000]]}]))},
    itemsCopper:50,budgetCopper:1000,simulationIdentity:'synthetic-profile/engine/encounter',objective:'dps',baseline:measurement(1000),
    signal:new AbortController().signal,limits:{configurations:128,simulations:2},
    simulate:async config=>{calls.push(config);return measurement(config.slots[0].gemIds[0]===8014?1500:1100);},...overrides};
  return {input,calls};
}
async function complete(h,first,limit=1000) {
  let result=first,turns=0;
  do {
    result=await optimizeAuctionGearEnhancements({...h.input,checkpoint:result?JSON.parse(JSON.stringify(result.checkpoint)):undefined});
    assert(result.simulations<=(h.input.limits?.simulations??1));assert(result.visited<=(h.input.limits?.configurations??128));
    if(++turns>limit)assert.fail('Exact traversal failed to finish');
  }while(!result.complete);
  return result;
}

test('exact resumes past twelve calls to a winner excluded by the legacy cap',async()=>{
  const legacy=fixture({exhaustive:false,limits:{simulations:12}});
  const capped=await complete(legacy);
  assert.equal(legacy.calls.length,12);assert.equal(capped.checkpoint.bestDpsConfirmed.simulation.dps,1100);
  assert(capped.reasons.includes('configuration_limit'));
  const exact=fixture();const first=await optimizeAuctionGearEnhancements(exact.input);
  assert.equal(first.complete,false);assert.equal(first.checkpoint.exactNextConfiguration,'2');
  const result=await complete(exact,first);
  assert.equal(exact.calls.length,21,'All twenty gem choices plus bare are measured');
  assert.equal(new Set(exact.calls.map(c=>c.key)).size,21);
  assert.equal(result.checkpoint.bestDpsConfirmed.simulation.dps,1500);
  assert.equal(result.checkpoint.exactNextConfiguration,'21');assert.equal(result.searchLimited,false);
  assert(!result.reasons.includes('configuration_limit'));
  const resumed=await optimizeAuctionGearEnhancements({...exact.input,checkpoint:result.checkpoint});
  assert.equal(resumed.simulations,0);assert.equal(exact.calls.length,21);
});

test('exact visits 101 compatible choices plus bare while legacy retains its catalog bound',async()=>{
  const h=fixture({choices:gems(101),limits:{configurations:128,simulations:12}});
  const result=await complete(h);
  assert.equal(h.calls.length,102);assert.equal(result.checkpoint.exactNextConfiguration,'102');
  assert.equal(new Set(h.calls.map(config=>config.key)).size,102);
  assert.equal(result.complete,true);assert.equal(result.searchLimited,false);
  await assert.rejects(()=>optimizeAuctionGearEnhancements({...h.input,exhaustive:false}),/enhancement_catalog_limit/);
});

test('exact passes 4096 traversal steps with bounded durable cache and pinned leaders',async()=>{
  const h=fixture({choices:gems(16),sockets:3,limits:{configurations:128,simulations:12}});
  const result=await complete(h);
  assert.equal(h.calls.length,17**3);assert.equal(result.checkpoint.traversalSteps,17**3);
  assert.equal(result.checkpoint.exactNextConfiguration,String(17**3));assert.equal(result.searchLimited,false);
  assert(Object.keys(result.checkpoint.cache).length<=256);
  for(const leader of [result.checkpoint.bestMeasuredDps,result.checkpoint.bestValueConfirmed,result.checkpoint.bestDpsConfirmed,...result.checkpoint.finalists])
    assert(result.checkpoint.cache[leader.configuration.key]);
  const resumed=await optimizeAuctionGearEnhancements({...h.input,checkpoint:JSON.parse(JSON.stringify(result.checkpoint))});
  assert.equal(resumed.complete,true);assert.equal(resumed.simulations,0);
});

test('decimal checkpoint cursor remains exact beyond Number.MAX_SAFE_INTEGER and rejects malformed/out-of-domain positions',async()=>{
  const h=fixture({choices:gems(1),slots:20,sockets:3,limits:{configurations:1,simulations:1}});
  const initial=await optimizeAuctionGearEnhancements({...h.input,shouldYield:()=>true});
  const position=2n**53n+7n;
  const checkpoint={...initial.checkpoint,exactNextConfiguration:String(position)};
  const result=await optimizeAuctionGearEnhancements({...h.input,checkpoint});
  assert.equal(result.checkpoint.exactNextConfiguration,String(position+1n));assert.equal(result.complete,false);
  assert.equal(h.calls.length,1);
  const selected=h.calls[0].slots.flatMap(row=>row.gemIds);
  for(let i=0;i<60;i++)assert.equal(selected[i],(position>>BigInt(i))&1n?0:8000);
  for(const cursor of ['-1','01','1e3','',1,String(2n**60n+1n)])
    await assert.rejects(()=>optimizeAuctionGearEnhancements({...h.input,checkpoint:{...initial.checkpoint,exactNextConfiguration:cursor}}),/invalid_enhancement_checkpoint/);
});

test('exact partial and bare configurations retain their true full cost and legacy still requires filled sockets',async()=>{
  const h=fixture({choices:gems(1),sockets:2,budgetCopper:60,
    prices:{sourceUpdatedAt:new Date().toISOString(),prices:{8000:{ladder:[[10,100]]}}},
    simulate:async config=>measurement(config.slots[0].gemIds.join(',')==='0,8000'?1500:1100)});
  const result=await complete(h);
  const best=result.checkpoint.bestDpsConfirmed.configuration;
  assert.deepEqual(best.slots[0].gemIds,[0,8000]);assert.equal(best.fullyEnhanced,false);
  assert.equal(best.totalCopper,60);assert.equal(best.consumables[0].quantity,1);
  assert.equal(result.checkpoint.totalSimulations,3);
  assert.equal((await optimizeAuctionGearEnhancements({...h.input,checkpoint:result.checkpoint})).simulations,0);
  assert.equal((await complete({input:{...h.input,exhaustive:false}})).finalists.length,0);
});

test('same-price timestamp refresh keeps the cursor; changed ladders replay cached comparisons; stale quotes clear leaders',async()=>{
  const h=fixture();const first=await optimizeAuctionGearEnhancements(h.input),count=h.calls.length;
  const newer=new Date(Date.parse(h.input.prices.sourceUpdatedAt)+1000).toISOString();
  const refreshed=await optimizeAuctionGearEnhancements({...h.input,prices:{...h.input.prices,sourceUpdatedAt:newer},checkpoint:first.checkpoint});
  assert.equal(refreshed.checkpoint.exactNextConfiguration,'4');assert.equal(h.calls.length,count+2);
  assert.equal(refreshed.checkpoint.bestDpsConfirmed.configuration.sourceUpdatedAt,newer);
  const repriced={...h.input.prices,prices:Object.fromEntries(gems(20).map(g=>[g.consumableItemId,{ladder:[[2,1000]]}]))};
  await assert.rejects(()=>optimizeAuctionGearEnhancements({...h.input,prices:repriced,checkpoint:refreshed.checkpoint}),/checkpoint_changed/);
  const replay=await optimizeAuctionGearEnhancements({...h.input,prices:repriced,simulationCache:refreshed.checkpoint.cache});
  assert(replay.visited>2);assert.equal(replay.checkpoint.bestDpsConfirmed.configuration.totalCopper,52);
  const stale=await optimizeAuctionGearEnhancements({...h.input,checkpoint:refreshed.checkpoint,now:Date.parse(newer)+MARKET_MAX_AGE_MS+1});
  assert.equal(stale.complete,true);assert.equal(stale.simulations,0);assert.equal(stale.checkpoint.exactNextConfiguration,'0');
  assert.equal(stale.checkpoint.bestMeasuredDps,undefined);assert.equal(stale.checkpoint.bestDpsConfirmed,undefined);
  assert(stale.reasons.includes('market_unverified'));
  const restored=await optimizeAuctionGearEnhancements({...h.input,checkpoint:stale.checkpoint});
  assert.equal(restored.complete,false);assert(restored.checkpoint.bestMeasuredDps);assert(!restored.reasons.includes('market_unverified'));
});

test('exact yields before work and cooperatively cancels a cached traversal without mutating its checkpoint',async()=>{
  const h=fixture({choices:gems(60),limits:{configurations:1024,simulations:12}});
  const ready=await complete(h),controller=new AbortController();
  const initial=await optimizeAuctionGearEnhancements({...h.input,shouldYield:()=>true});
  assert.equal(initial.checkpoint.exactNextConfiguration,'0');assert.equal(initial.visited,0);
  const before=JSON.stringify(initial.checkpoint);
  setImmediate(()=>controller.abort());
  await assert.rejects(()=>optimizeAuctionGearEnhancements({...h.input,checkpoint:initial.checkpoint,simulationCache:ready.checkpoint.cache,signal:controller.signal}),{name:'AbortError'});
  assert.equal(JSON.stringify(initial.checkpoint),before);
});

function stageFixture(socketCount=1,budgetCopper=500) {
  const engine=`SimulationCraft ${auctionEnhancementCatalogInfo.simcRevision.slice(0,7)} synthetic-exact-stage`;
  const candidate={entityId:'synthetic-stage-item',itemId:960010,name:'Synthetic trinket',slotType:'TRINKET_1',itemLevel:150,inventoryType:12,itemClassId:4,itemSubclassId:0,
    constraints:{uniqueEquipped:false,crafted:false,allowableClassMask:'1',requiredLevel:1},compatibility:{specId:72,method:'specialization',itemClassId:4,itemSubclassId:0},eligible:true,rejectionReasons:[],
    variants:[{key:'synthetic-verified',itemLevel:150,bonusIds:[101],contextId:13,resolution:{engine,stats:{},requiredLevel:1,metadataVersion:2,
      enhancements:{status:'verified',socketColors:[14,socketCount===2?14:0,0],socketCount,socketBonusId:0,requiredProfessionId:0,requiredProfessionRank:0}}}]};
  const equipment={equipped_items:[{slot:{type:'TRINKET_1'},item:{id:970010}}]};
  const loadout=[{slotType:'TRINKET_1',itemId:970010,inventoryType:12,itemSubclassId:0}];
  let allowed=[];const calls=[];
  const input={exhaustive:true,finalists:[{label:'synthetic',options:[{id:'synthetic-option',auctionId:980010,quantity:1,costCopper:100,candidate,variantKey:'synthetic-verified'}]}],
    equipment,loadout,specId:72,level:90,region:'eu',engine,profileFingerprint:'synthetic-profile',encounter:{scenario:'single-target',fightLengthSeconds:120,targets:1},
    budgetCopper,objective:'value',baseline:{...measurement(1000),engine},signal:new AbortController().signal,shouldYield:()=>false,state:{checkpoints:{}},
    quote:async(_region,ids)=>{allowed=ids.slice(0,socketCount===2?1:20);return {prices:Object.fromEntries(allowed.map(id=>[id,{ladder:[[10,100]]}])),sourceUpdatedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()};},
    simulate:async options=>{
      const changes=prepareGearLoadout({selections:options,equipment,loadout,specId:72}).changes;calls.push(changes);
      const ids=changes[0].gemIds??[];
      return {...measurement(socketCount===2?(ids[0]===0&&ids[1]>0?1500:1100):ids[0]===allowed[14]?1500:ids[0]===allowed[18]?2000:1100,
        socketCount===1&&ids[0]===allowed[18]?1000:1),engine};
    }};
  return {input,calls};
}
async function finishStage(h) {
  for(let turn=0;turn<100;turn++) {
    const result=await evaluateAuctionEnhancementStage(h.input);
    h.input.state=JSON.parse(JSON.stringify(h.input.state));
    if(result.complete)return result;
  }
  assert.fail('Stage exact cursor did not finish its fixture domain');
}

test('actual stage migrates capped legacy work and exposes measured/confirmed exact leaders past twelve configurations',async()=>{
  const h=stageFixture();h.input.exhaustive=false;
  await finishStage(h);assert.equal(h.calls.length,12);
  h.input.exhaustive=true;
  const result=await finishStage(h);
  assert.equal(result.traversal,'exhaustive');assert.equal(result.status,'ready');assert.equal(h.calls.length,21);
  assert.equal(new Set(h.calls.map(changes=>JSON.stringify(changes))).size,21,'Migration reuses every legacy measured configuration');
  assert.deepEqual(result.recommendations.map(row=>row.simulation.dps),[2000,1500]);
  assert.equal(result.recommendations[0].comparison.uncertainty.significant,false);
  assert(result.reasons.includes('enhancement_catalog_subset'));assert(result.reasons.includes('price_unknown_or_insufficient_quantity'));
  assert.deepEqual(result.recommendations[0].removedSlots,[]);
});

test('actual exact stage sends a positional empty socket and prices an affordable partial winner',async()=>{
  const h=stageFixture(2,110);const result=await finishStage(h);
  assert.equal(result.status,'ready');assert.equal(h.calls.length,3);
  const best=result.recommendations.find(row=>row.simulation.dps===1500);
  assert(best);assert.equal(best.configuration.fullyEnhanced,false);assert.equal(best.configuration.totalCopper,110);
  assert.equal(best.configuration.consumables[0].quantity,1);
  assert(h.calls.some(changes=>changes[0].gemIds?.[0]===0&&changes[0].gemIds[1]>0));
  assert(h.calls.some(changes=>!changes[0].gemIds?.length),'Bare replacement is evaluated with no purchased gem');
});
