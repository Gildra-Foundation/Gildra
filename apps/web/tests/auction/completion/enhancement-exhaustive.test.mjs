// Synthetic algorithm fixtures, never live DPS/market claims.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import { optimizeAuctionGearEnhancements } from '../../../lib/wow/auctionGearEnhancementOptimizer.ts';
import { purchasedJewelryGemEffect } from '../../../lib/wow/auctionGearMechanicalCache.ts';
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

test('a screen probe counts only affordable layouts and yields without consuming the exact cursor',async()=>{
  const choices=gems(8), witnessed=new Set();
  const h=fixture({choices,sockets:2,budgetCopper:51,
    prices:{sourceUpdatedAt:new Date().toISOString(),prices:Object.fromEntries(choices.map(g=>[g.consumableItemId,{ladder:[[1,1]]}]))},
    remainingScreenComparisons:()=>65,onPricedScreenWitness:config=>{
      assert.equal(config.status,'priced');assert(config.totalCopper<=51);witnessed.add(config.key);
    }});
  let paused=true;
  h.input.shouldYield=()=>paused && witnessed.size===1;
  const interrupted=await optimizeAuctionGearEnhancements(h.input);
  assert.equal(interrupted.visited,0);assert.equal(interrupted.simulations,0);
  assert.equal(interrupted.checkpoint.exactNextConfiguration,'0');
  paused=false;
  await complete(h,interrupted);
  assert.equal(witnessed.size,1,'A short time slice cannot repeatedly restart the probe');
  assert.equal(h.calls.length,17);
  witnessed.clear();h.calls.length=0;
  await complete(h);
  assert.equal(witnessed.size,17,'Two sockets give 81 raw combinations but only 17 purchasable receipts');
  assert.deepEqual(witnessed,new Set(h.calls.map(c=>c.key)));
});

test('unpriced purchases leave bare and installed gems available; legacy ordinals still resume',async()=>{
  const prices={sourceUpdatedAt:new Date().toISOString(),prices:{8000:{ladder:[[1,1000]]}}};
  const h=fixture({choices:gems(3),prices,limits:{configurations:1,simulations:1}});
  const fresh=await complete(h);
  assert.deepEqual(h.calls.map(c=>c.slots[0].gemIds),[[8000],[0]]);
  assert.equal(fresh.checkpoint.exactNextConfiguration,'2');
  assert(fresh.reasons.includes('price_unknown_or_insufficient_quantity'));
  const old=fixture({choices:gems(3),prices,limits:{configurations:1,simulations:1}});
  // A pre-compaction v1 cursor just after the purchasable gem, before two missing quotes.
  const saved={version:1,inputKey:'568285e82ee39d334f563b5945049671c76a0b5fd6f5868ee56cbdadbe802082',
    exactNextConfiguration:'1',nextConfiguration:0,cache:{}};
  const resumed=await complete(old,{checkpoint:saved});
  assert.deepEqual(old.calls.map(c=>c.slots[0].gemIds),[[0]]);
  assert.equal(resumed.checkpoint.exactNextConfiguration,'4');
  const owned=fixture({choices:gems(3),prices});
  Object.assign(owned.input.slots[0],{owned:true,allowOwnedChanges:true,ownedItemId:42,installed:{gems:[gems(3)[2]]}});
  await complete(owned);
  assert.deepEqual(owned.calls.map(c=>[c.slots[0].gemIds[0],c.totalCopper]),[[8002,50],[8000,51]]);
});

test('exact prices one unit against the remaining budget and preserves previous priced-axis cursors',async()=>{
  const prices={sourceUpdatedAt:new Date().toISOString(),prices:{8000:{ladder:[[950,1],[999,2]]},8001:{ladder:[[951,2]]}}};
  const opts={choices:gems(3),prices,limits:{configurations:1,simulations:1}};
  const current=fixture(opts);
  const fresh=await complete(current);
  assert.deepEqual(current.calls.map(c=>[c.slots[0].gemIds[0],c.totalCopper]),[[8000,1000],[0,50]]);
  assert.equal(fresh.checkpoint.exactNextConfiguration,'2');
  assert(fresh.reasons.includes('over_budget'));
  assert(fresh.reasons.includes('price_unknown_or_insufficient_quantity'));

  const old=fixture(opts);
  const previous={version:1,pricedAxes:true,inputKey:'04b88171594d257bab8fd3b3f0757090d812a7014296d787bba1645233e4783b',
    exactNextConfiguration:'1',nextConfiguration:0,cache:{}};
  const resumed=await complete(old,{checkpoint:previous});
  assert.deepEqual(old.calls.map(c=>[c.slots[0].gemIds[0],c.totalCopper]),[[0,50]]);
  assert.equal(resumed.checkpoint.exactNextConfiguration,'3');

  const owned=fixture({...opts,sockets:2});
  Object.assign(owned.input.slots[0],{owned:true,allowOwnedChanges:true,ownedItemId:42,installed:{gems:[gems(3)[1],null]}});
  await complete(owned);
  assert.deepEqual(owned.calls.map(c=>[c.slots[0].gemIds,c.totalCopper]),[
    [[8001,8000],1000],[[8001,0],50],[[8000,0],1000]
  ]);
});

test('exact visits 101 compatible choices plus bare and the quick search accepts the same catalog',async()=>{
  const h=fixture({choices:gems(101),limits:{configurations:128,simulations:12}});
  const result=await complete(h);
  assert.equal(h.calls.length,102);assert.equal(result.checkpoint.exactNextConfiguration,'102');
  assert.equal(new Set(h.calls.map(config=>config.key)).size,102);
  assert.equal(result.complete,true);assert.equal(result.searchLimited,false);
  const quick=await optimizeAuctionGearEnhancements({...h.input,exhaustive:false});
  assert.equal(quick.searchLimited,true);
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
    variants:[{key:'synthetic-verified',itemLevel:150,bonusIds:[101],contextId:13,resolution:{engine,stats:{},requiredLevel:1,metadataVersion:3,
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

test('actual exact stage retains a successful sibling through failure and JSON-restored retry',async()=>{
  const h=stageFixture();h.input.simulationConcurrency=2;
  const original=h.input.simulate,attempts=[];let failSecond=true;
  h.input.simulate=async(options,signal)=>{
    attempts.push(JSON.stringify(options.map(option=>option.customization)));
    if(failSecond&&attempts.length===2){await new Promise(resolve=>setImmediate(resolve));throw Error('stage_second_failed');}
    return original(options,signal);
  };
  await assert.rejects(evaluateAuctionEnhancementStage(h.input),/stage_second_failed/);
  const pending=Object.values(h.input.state.checkpoints)[0];
  assert.equal(pending.exactNextConfiguration,'0');assert.equal(Object.keys(pending.cache).length,1);
  const completed=attempts[0],failed=attempts[1];failSecond=false;h.input.state=JSON.parse(JSON.stringify(h.input.state));
  const result=await finishStage(h);assert.equal(result.complete,true);assert.equal(result.status,'ready');
  assert.equal(attempts.filter(key=>key===completed).length,1);
  assert.equal(attempts.filter(key=>key===failed).length,2);
  assert(result.recommendations.every(row=>row.configuration.totalCopper<=h.input.budgetCopper));
});

test('stage rejects ambiguous legacy nonzero sockets and retains valid v2 all-zero compatibility',async()=>{
  const ambiguous=stageFixture();ambiguous.input.finalists[0].options[0].candidate.variants[0].resolution.metadataVersion=2;
  const unavailable=await evaluateAuctionEnhancementStage(ambiguous.input);
  assert.equal(unavailable.status,'unavailable');assert(unavailable.reasons.includes('variant_enhancements_unknown'));assert.equal(ambiguous.calls.length,0);
  const zero=stageFixture(),resolution=zero.input.finalists[0].options[0].candidate.variants[0].resolution;
  resolution.metadataVersion=2;resolution.enhancements.socketColors=[0,0,0];resolution.enhancements.socketCount=0;
  const ready=await evaluateAuctionEnhancementStage(zero.input);
  assert.equal(ready.status,'ready');assert.equal(zero.calls.length,1);assert.equal(ready.recommendations[0].configuration.consumables.length,0);
});

test('value mode retains the two highest measured configurations even when value leaders use different gems', async () => {
  const choices = gems(5);
  const h = fixture({choices, objective:'value',
    prices:{sourceUpdatedAt:new Date().toISOString(), prices:Object.fromEntries(choices.map((gem,i)=>[gem.consumableItemId,{ladder:[[i<2?500:1,10]]}]))},
    simulate:async configuration=>{
      const gem = configuration.slots[0].gemIds[0];
      return measurement(gem===8000?1200:gem===8001?1199:gem?1190:1000);
    }});
  const result=await complete(h);
  assert.equal(result.checkpoint.bestMeasuredDps.configuration.slots[0].gemIds[0],8000);
  assert.equal(result.checkpoint.secondMeasuredDps.configuration.slots[0].gemIds[0],8001);
  assert.equal(result.checkpoint.thirdMeasuredDps.simulation.dps,1190,'Strongest untouched contender survives in the same equipment set');
  assert(result.checkpoint.cache[result.checkpoint.thirdMeasuredDps.configuration.key]);
  assert(result.checkpoint.bestValueConfirmed.configuration.slots[0].gemIds[0]>=8002);
  assert(result.checkpoint.cache[result.checkpoint.secondMeasuredDps.configuration.key]);
});

test('the three measured finalists retain the cheapest scroll for each distinct native enchant',async()=>{
  const h=fixture({sockets:0,limits:{configurations:1,simulations:1}});
  const enchants=[{id:6101,cost:5},{id:6102,cost:10},{id:6103,cost:15}].flatMap(({id,cost})=>
    [0,1].map(offset=>({key:`scroll-${id}-${offset}`,kind:'enchant',simulationId:id,
      consumableItemId:2*id+offset,cost:cost+100*offset})));
  h.input.catalog.resolve=()=>({verified:true,enchantApplicable:true,enchantChoices:enchants,gemChoices:{}});
  h.input.prices.prices=Object.fromEntries(enchants.map(scroll=>[scroll.consumableItemId,{ladder:[[scroll.cost,1]]}]));
  const ids=[];
  h.input.simulate=async config=>{
    const enchant=config.slots[0].enchantId;ids.push(enchant);
    return measurement(enchant?2000-enchant%100:1000);
  };
  const {checkpoint}=await complete(h);
  assert.equal(ids.length,4,'Six scrolls and bare yield only four native effects across restored slices');
  assert.equal(checkpoint.exactNextConfiguration,'4');
  assert.equal(checkpoint.pricedAxes,'equivalent_scrolls');
  // A pre-substitution cursor pointing at the three costly scrolls and bare.
  const legacy = {version:1,pricedAxes:'within_budget',inputKey:'a23bee658ce042ce03a9b200169562d07af321143b1397e2390f915471b28034',
    exactNextConfiguration:'3',nextConfiguration:0,cache:{}};
  const resumed = await complete(h,{checkpoint:legacy});
  assert.equal(resumed.checkpoint.exactNextConfiguration,'7');
  assert.deepEqual(ids.slice(4),[6101,6102,6103,0]);
  const leaders=[checkpoint.bestMeasuredDps,checkpoint.secondMeasuredDps,checkpoint.thirdMeasuredDps];
  assert.deepEqual(leaders.map(row=>[row.configuration.slots[0].enchantId,row.configuration.totalCopper,
    row.configuration.consumables[0].itemId]),[[6101,55,12202],[6102,60,12204],[6103,65,12206]]);
});

test('scroll substitution respects shared stock, marginal price, ties and equip restrictions',async()=>{
  const scroll=(id,properties={})=>({key:String(id),kind:'enchant',simulationId:123,consumableItemId:id,...properties});
  for(const [cheap,other,restrictions,expectedCount,cost] of [
    [[[2,2]],[[5,2]],{},4,4],
    [[[2,1]],[[5,2]],{},9,7],
    [[[2,1],[8,1]],[[5,2]],{},9,7],
    [[[2,1],[5,1]],[[5,2]],{},9,7],
    [[[2,2]],[[5,2]],{category:{id:'one',limit:1}},9,7],
  ]){
    const h=fixture({sockets:0,slots:2,objective:'value'});
    h.input.catalog.resolve=()=>({verified:true,enchantApplicable:true,enchantChoices:[scroll(1,restrictions),scroll(2)],gemChoices:{}});
    h.input.prices.prices={1:{ladder:cheap},2:{ladder:other}};
    h.input.simulate=async c=>measurement(1000+c.slots.filter(s=>s.enchantId).length*500);
    const result=await complete(h);
    assert.equal(Number(result.checkpoint.exactNextConfiguration),expectedCount);
    for(const leader of [result.checkpoint.bestDpsConfirmed,result.checkpoint.bestValueConfirmed]){
      assert.equal(leader.simulation.dps,2000);
      assert.equal(leader.configuration.totalCopper,50+cost);
      assert.equal(leader.configuration.consumables.reduce((n,row)=>n+row.quantity,0),2);
    }
  }
});

test('the real enhancement stage uses the advertised profileset capacity for affordable gem choices', async () => {
  const h = stageFixture();
  Object.assign(h.input, {simulationConcurrency: 2, simulationBatchSize: 25});
  await evaluateAuctionEnhancementStage(h.input);
  assert.equal(h.calls.length, 21, 'the twenty stocked gems and the bare slot fit in one slice');
  const result = await finishStage(h);
  assert.equal(h.calls.length, 21);
  assert.equal(result.complete, true);
  assert.deepEqual(result.recommendations.map(row => row.simulation.dps), [2000, 1500]);
});

test('owned-only stage admits queued gem edits when the native worker advertises that contract', async () => {
  for (const supported of [false, true]) {
    const h = stageFixture();
    h.input.finalists[0].options = [];
    Object.assign(h.input.equipment.equipped_items[0], {item_class:{id:4},level:{value:150},sockets:[{socket_type:{type:'PRISMATIC'}}]});
    Object.assign(h.input, {selectedSlots:['TRINKET_1'],simulationConcurrency:2,simulationBatchSize:25,simulationOwnedBatch:supported,
      simulate: async (options,signal,edits) => {
        assert.deepEqual(options,[]);
        signal.throwIfAborted();
        h.calls.push(edits);
        return {...measurement(1200),engine:h.input.engine};
      }});
    await evaluateAuctionEnhancementStage(h.input);
    assert.equal(h.calls.length,supported ? 21 : 2);
    const gemEdits=h.calls.filter(changes=>changes.length);
    assert.equal(gemEdits.length,supported ? 20 : 2);
    for (const [change] of gemEdits) {
      assert.equal(change.itemId,970010);
      assert.equal(change.slotType,'TRINKET_1');
      assert.equal(change.gems[0].index,0);
    }
    assert.equal(new Set(gemEdits.map(([change])=>change.gems[0].itemId)).size,gemEdits.length);
    const result = await finishStage(h);
    assert(result.complete);
    assert.equal(h.calls.length,21);
  }
});

test('strictly cheaper certified ring gems prune whole branches only when substitution is affordable at every position', async () => {
  const engine='SimulationCraft fixture · 18428cd';
  const gem = (id, flags={}) => ({key:String(id), simulationId:id, consumableItemId:id, kind:'gem', ...flags});
  const cheap=130216, dear=153711;
  async function run({ladder=[[2,2]], restricted={}, own=false, effect=false, otherEnchant=false, legacy=false, installed=false, cheapId=cheap, dearId=dear, nativeLevel, neck=false}={}) {
    const source=stageFixture().input.finalists[0].options[0];
    const c=source.candidate, variant=c.variants[0];
    Object.assign(c,{itemClassId:4,inventoryType:11});
    Object.assign(variant.resolution,{engine,nativeNoItemEffects:!effect});
    const h=fixture({choices:[gem(cheapId,restricted),gem(dearId)],slots:2});
    h.input.slots.forEach((slot,i)=>Object.assign(slot,{slotType:neck && i === 0 ? "NECK" : `FINGER_${i+1}`,owned:own,allowOwnedChanges:own}));
    if(installed) h.input.slots.push({slotType:'NECK',variantKey:'owned-neck',metadataKey:'owned-socket',owned:true,
      sockets:[{key:'0',type:'14'}],installed:{gems:[gem(cheapId,{uniqueEquipped:true})]}});
    const resolve=h.input.catalog.resolve;
    if(otherEnchant) h.input.catalog.resolve=slot=>({...resolve(slot),enchantApplicable:true,
      enchantChoices:[{key:'enchant',kind:'enchant',simulationId:5555,consumableItemId:12}]});
    h.input.prices.prices={[cheapId]:{ladder},[dearId]:{ladder:[[5,2]]},12:{ladder:[[1,10]]}};
    h.input.purchasedGemEffect=(slot,id,enchant)=>purchasedJewelryGemEffect({...source,candidate:{...c,slotType:slot,inventoryType:slot === "NECK" ? 2 : 11}},engine,id,enchant,nativeLevel);
    h.input.simulate=async config=>measurement(1000+100*config.slots.filter(s=>s.gemIds[0]).length);
    const first=legacy ? await optimizeAuctionGearEnhancements({...h.input,purchasedGemEffect:undefined,limits:{configurations:1}}) : undefined;
    const choices=[];
    h.input.onMeasured=config=>choices.push(config);
    return {...await complete(h,first),choices};
  }
  const actual=await run(), previous=await run({legacy:true});
  assert.equal(actual.checkpoint.pricedAxes,'equivalent_gems');
  assert.equal(actual.checkpoint.exactNextConfiguration,'4');
  assert.equal(previous.checkpoint.exactNextConfiguration,'9');
  for(const objective of ['bestValueConfirmed','bestDpsConfirmed'])
    assert.deepEqual(actual.checkpoint[objective].configuration.slots,previous.checkpoint[objective].configuration.slots);
  const level90Pair = {cheapId:115804, dearId:115811};
  for (const [nativeLevel, count] of [[90,'4'], [89,'9'], [undefined,'9']]) {
    const trial = await run({...level90Pair, nativeLevel});
    assert.equal(trial.checkpoint.exactNextConfiguration, count);
  }
  const neckAndRing = await run({...level90Pair, nativeLevel:90, neck:true});
  assert.equal(neckAndRing.checkpoint.exactNextConfiguration, '4');
  const scarce = await run({...level90Pair, nativeLevel:90, neck:true, ladder:[[2,1],[6,1]]});
  assert.equal(scarce.checkpoint.exactNextConfiguration, '9');
  const lowerLevel = await run({...level90Pair, nativeLevel:89, neck:true});
  assert.equal(lowerLevel.checkpoint.exactNextConfiguration, '9');
  const costlySecondCopy = await run({...level90Pair, nativeLevel:90, ladder:[[2,1],[6,1]]});
  assert.equal(costlySecondCopy.checkpoint.exactNextConfiguration, '9');
  const mixed=await run({otherEnchant:true});
  assert.equal(mixed.checkpoint.pricedAxes,'conditional_ring_gems');
  assert.equal(mixed.choices.length,25);
  assert(mixed.choices.every(row=>row.slots.every(s=>s.gemIds[0]!==dear || s.enchantId===5555)));
  assert(mixed.choices.some(row=>row.slots.every(s=>s.gemIds[0]===dear && s.enchantId===5555)));
  for(const flags of [{ladder:[[2,1]]},{ladder:[[2,1],[5,1]]},{ladder:[[2,1],[6,1]]},
    {restricted:{uniqueEquipped:true}},{restricted:{category:{id:'q',limit:1}}},{effect:true},{own:true},{installed:true}]) {
    assert.notEqual((await run(flags)).checkpoint.pricedAxes,'equivalent_gems',JSON.stringify(flags));
  }
});

test('whole ring upgrades use exact aggregate ratings and conservative shared commodity prices', async () => {
  const hasteGem = { key:'haste-gem', kind:'gem', simulationId:115804, consumableItemId:115804 };
  const weak = { key:'weak-scroll', kind:'enchant', simulationId:8020, consumableItemId:244010 };
  const strong = { key:'strong-scroll', kind:'enchant', simulationId:8021, consumableItemId:244011 };
  const extra = { ...strong, key:'another-scroll', consumableItemId:9777 };
  const quotedAt = new Date().toISOString();
  async function run({ rings = 1, enabled = true, strongPrice = [[4,4]], alternative = false, uniqueStrong = false } = {}) {
    const h = fixture({ choices:[hasteGem], slots:rings });
    h.input.prices.sourceUpdatedAt = quotedAt;
    const names = Array.from({ length:rings }, (_, i) => 'FINGER_' + (i + 1));
    names.forEach((name, i) => { h.input.slots[i].slotType = name; });
    h.input.ratingRingSlots = enabled ? new Set(names) : undefined;
    h.input.catalog.resolve = () => ({ verified:true, enchantApplicable:true, gemChoices:{'0':[hasteGem]},
      enchantChoices:[weak, { ...strong, uniqueEquipped:uniqueStrong }, ...(alternative ? [extra] : [])] });
    h.input.prices.prices = {115804:{ladder:[[3,4]]},244010:{ladder:[[2,4]]},244011:{ladder:strongPrice},9777:{ladder:[[8,4]]}};
    h.input.simulate = async config => {
      h.calls.push(config);
      const haste = config.slots.reduce((sum, s) => sum + (s.gemIds[0] ? 2 : 0) +
        (s.enchantId === 8020 ? 22 : s.enchantId === 8021 ? 24 : 0), 0);
      return measurement(1000 + haste * 10);
    };
    const receipts = [];
    h.input.onMeasured = configuration => receipts.push(configuration);
    const result = await complete(h);
    return { result:result.checkpoint, evaluated:h.calls, receipts };
  }
  const paired = config => config.slots.some(s => s.enchantId === 8020 && s.gemIds[0] === 115804);
  for (const rings of [1,2]) {
    const original = await run({ rings, enabled:false }), pruned = await run({ rings });
    assert.equal(pruned.result.pricedAxes, 'combined_ring_cost');
    assert.equal(original.evaluated.length, 6 ** rings);
    assert.equal(pruned.evaluated.length, rings === 1 ? 5 : 21);
    assert.equal(pruned.result.ringPricePruning.configurations, String(original.evaluated.length - pruned.evaluated.length));
    assert.equal(pruned.result.pairedRingPrices === true, rings === 2);
    assert(!pruned.evaluated.some(paired));
    for (const objective of ['bestValueConfirmed','bestDpsConfirmed']) {
      assert.deepEqual(pruned.result[objective], original.result[objective]);
    }
  }
  for (const options of [{rings:2,strongPrice:[[4,1]]}, {rings:2,strongPrice:[[4,1],[7,1]]},
    {strongPrice:[[5,4]]}, {uniqueStrong:true}]) {
    const result = await run(options);
    assert(result.evaluated.some(paired), JSON.stringify(options));
  }
  // Two scroll SKUs apply the same enchant. The cheap one has only one copy.
  // A cost guard for the expensive scroll must keep its cheaper sibling.
  const twoSkus = await run({rings:2, strongPrice:[[4,1]], alternative:true});
  const bareStrong = twoSkus.receipts.filter(c => c.slots.every(s => !s.gemIds[0]) &&
    c.slots.some(s => s.enchantId === 8021));
  assert(bareStrong.some(c => c.consumables.some(p => p.itemId === 244011)));
  assert(bareStrong.every(c => c.consumables.every(p => p.itemId !== 9777)));
  const reverse = await run({strongPrice:[[7,4]]});
  assert(reverse.evaluated.some(paired));
  assert(!reverse.evaluated.some(c => c.slots[0].enchantId === 8021 && !c.slots[0].gemIds[0]));
});

test('an owned ring can exchange two paid upgrades only when the whole replacement is affordable',async()=>{
  const gem=(id)=>({key:String(id),kind:'gem',simulationId:id,consumableItemId:id});
  const small=gem(115804), large=gem(130220); // +2 and +4 haste
  const enchant=(id,sku)=>({key:String(sku),kind:'enchant',simulationId:id,consumableItemId:sku});
  const weak=enchant(8020,244010),strong=enchant(8021,244011); // +22 and +24 haste
  async function run({enabled=true,limited=false,equal=false,installed=false}={}) {
    const h=fixture({choices:[small,large],slots:2});
    for(const [i,s] of h.input.slots.entries()) Object.assign(s,{slotType:'FINGER_'+(i+1),owned:true,
      allowOwnedChanges:true,ownedItemId:100+i,installed:{gems:[installed?large:null],...(installed?{enchant:weak}:{})}});
    h.input.ratingRingSlots=enabled ? new Set(h.input.slots.map(s=>s.slotType)) : undefined;
    h.input.catalog.resolve=()=>({verified:true,enchantApplicable:true,enchantChoices:[weak,strong],gemChoices:{'0':[small,large]}});
    h.input.prices.prices={115804:{ladder:[[1,4]]},130220:{ladder:[[20,4]]},244010:{ladder:[[5,4]]},
      244011:{ladder:limited?[[2,1],[30,3]]:[[equal?24:2,4]]}};
    h.input.simulate=async config=>measurement(1000+config.slots.reduce((sum,s)=>sum+
      (s.enchantId===8020?22:s.enchantId===8021?24:0)+(s.gemIds[0]===115804?2:s.gemIds[0]===130220?4:0),0)*10);
    const receipts=[];h.input.onMeasured=config=>receipts.push(config);
    const result=await complete(h);
    return {receipts,state:result.checkpoint};
  }
  const expensive=c=>c.slots.some(s=>s.enchantId===8020 && s.gemIds[0]===130220);
  const gold=await run({enabled:false}),cut=await run();
  assert(gold.receipts.some(expensive));assert(!cut.receipts.some(expensive));
  assert(cut.state.ringPricePruning);assert(cut.receipts.length<gold.receipts.length);
  for(const objective of ['bestDpsConfirmed','bestValueConfirmed']) {
    assert.deepEqual(cut.state[objective].configuration.slots,gold.state[objective].configuration.slots);
    assert.equal(cut.state[objective].configuration.totalCopper,gold.state[objective].configuration.totalCopper);
  }
  for(const flags of [{limited:true},{equal:true}]) assert((await run(flags)).receipts.some(expensive));
  const retained=await run({installed:true});
  assert(retained.receipts.some(c=>expensive(c)&&!c.ownedChanges?.length&&c.consumables.length===0));
});

test('two rings retain every cheapest tied receipt at each rating and reject uncertified substitutions', async () => {
  const gem = id => ({ key:String(id), kind:'gem', simulationId:id, consumableItemId:id });
  const small = gem(115804), large = gem(130220); // 2 and 4 haste
  const haste = config => config.slots.reduce((sum, slot) => sum +
    (slot.gemIds[0] === small.simulationId ? 2 : slot.gemIds[0] === large.simulationId ? 4 : 0), 0);
  const quotedAt = new Date().toISOString();

  async function run({ certified = true, smallLadder = [[3,2]], largePrice = 10, unique = false,
    restoreLegacy = false, otherRating = false } = {}) {
    const second = otherRating ? gem(130219) : large; // Same magnitude, critical strike.
    const h = fixture({ choices:[small,second], slots:2 });
    h.input.slots.forEach((slot, i) => { slot.slotType = 'FINGER_' + (i + 1); });
    h.input.ratingRingSlots = new Set(certified ? ['FINGER_1','FINGER_2'] : ['FINGER_1']);
    h.input.catalog.resolve = () => ({ verified:true, enchantApplicable:true, enchantChoices:[],
      gemChoices:{ '0':[{ ...small, uniqueEquipped:unique }, second] } });
    h.input.prices.sourceUpdatedAt = quotedAt;
    h.input.prices.prices = { [small.consumableItemId]:{ladder:smallLadder}, [second.consumableItemId]:{ladder:[[largePrice,2]]} };
    h.input.simulate = async config => measurement(1000 + 10 * haste(config));
    const receipts = [];
    h.input.onMeasured = config => receipts.push(config);
    let first;
    if (restoreLegacy) {
      h.input.ratingRingSlots = new Set(['FINGER_1']);
      first = await optimizeAuctionGearEnhancements(h.input);
      assert.equal(first.checkpoint.pairedRingPrices, undefined);
      h.input.ratingRingSlots.add('FINGER_2');
    }
    const { checkpoint } = await complete(h, first);
    return { receipts, checkpoint };
  }

  const separateStats = await run({ otherRating:true });
  assert.equal(separateStats.receipts.length, 9);
  const restored = await run({ restoreLegacy:true }), legacy = await run({ certified:false });
  assert.equal(restored.checkpoint.pairedRingPrices, undefined);
  assert.deepEqual(restored.receipts, legacy.receipts);

  const cases = [
    [{}, 0], [{ smallLadder:[[3,1]] }, 2], [{ smallLadder:[[3,1],[9,1]] }, 2],
    [{ largePrice:6 }, 2], [{ unique:true }, 2],
  ];
  for (const [flags, expectedSingleLarge] of cases) {
    const gold = await run({ ...flags, certified:false }), actual = await run(flags);
    const retained = new Set(actual.receipts.map(c => c.key));
    for (const receipt of gold.receipts) {
      if (!retained.has(receipt.key)) assert(actual.receipts.some(c =>
        haste(c) === haste(receipt) && c.totalCopper < receipt.totalCopper));
    }
    for (const objective of ['bestDpsConfirmed','bestValueConfirmed'])
      assert.deepEqual(actual.checkpoint[objective], gold.checkpoint[objective]);
    const oneLarge = c => c.slots.some(slot => slot.gemIds[0] === large.simulationId) && haste(c) === 4;
    assert.equal(gold.receipts.filter(oneLarge).length, 2);
    assert.equal(actual.receipts.filter(oneLarge).length, expectedSingleLarge);
  }
});

test('a purchased neck gem can exchange integer ratings with both rings at a strictly lower total price', async () => {
  const gem = id => ({ key:String(id), kind:'gem', simulationId:id, consumableItemId:id });
  const choices = [115804,130216,130220,115803].map(gem); // Haste 2/3/4, crit 2
  const hasteScroll = { key:'haste',kind:'enchant',simulationId:8020,consumableItemId:244010 };
  const rings = ['FINGER_1','FINGER_2'];
  const observed = new Date().toISOString();
  // Keep crit and haste distinct, even when the number of rating points matches.
  function ratings(config) {
    let crit = 0, haste = 0;
    for (const { gemIds, enchantId } of config.slots) {
      if (enchantId === 8020) haste += 22;
      for (const id of gemIds) {
        if (id === 115803) crit += 2;
        haste += ({ 115804:2, 130216:3, 130220:4 })[id] ?? 0;
      }
    }
    return [crit, haste];
  }
  async function run({ certified = true, legacy = false, tie = false, scarce = false, enchanted = false, purchased = false } = {}) {
    const h = fixture({ choices,slots:3,limits:{configurations:1024,simulations:12} });
    for (const [i, slot] of h.input.slots.entries()) {
      slot.slotType = [...rings,'NECK'][i];
      if (i === 2 && !purchased) Object.assign(slot,{owned:true,allowOwnedChanges:true,ownedItemId:831});
    }
    h.input.ratingRingSlots = new Set(rings);
    h.input.ratingOwnedNeck = certified;
    h.input.catalog.resolve = slot => ({verified:true,enchantApplicable:slot.slotType !== 'NECK' || enchanted,
      enchantChoices:slot.slotType !== 'NECK' ? [hasteScroll] : [],gemChoices:{'0':choices}});
    const ladder = id => tie ? [[2,4]] : id === 130216 ? [[8,4]] : scarce ? [[1,1],[9,1]] : [[1,3]];
    h.input.prices = {sourceUpdatedAt:observed, prices:Object.fromEntries(
      [...choices.map(c=>c.simulationId),244010].map(id=>[id,{ladder:ladder(id)}]))};
    h.input.simulate = async config => {
      const [crit,haste] = ratings(config);
      return measurement(1050 + 20 * crit + haste * (60 - haste));
    };
    const receipts = new Map();
    h.input.onMeasured = c => receipts.set(c.key,c);
    const first = legacy ? await optimizeAuctionGearEnhancements({...h.input,ratingOwnedNeck:false}) : undefined;
    const result = await complete(h,first);
    return { checkpoint:result.checkpoint, receipts };
  }
  const original = await run({certified:false});
  const candidate = await run();
  assert.equal(candidate.checkpoint.pairedNeckPrices,true);
  assert(candidate.receipts.size < original.receipts.size);
  function checkCoverage(candidate, original) {
    const affordable = new Map();
    for (const c of candidate.receipts.values()) {
      const key = JSON.stringify(ratings(c));
      affordable.set(key,Math.min(c.totalCopper,affordable.get(key) ?? Infinity));
    }
    for (const [key,c] of original.receipts) {
      if (!candidate.receipts.has(key)) assert(affordable.get(JSON.stringify(ratings(c))) < c.totalCopper);
    }
    for (const key of ['bestDpsConfirmed','bestValueConfirmed']) assert.deepEqual(candidate.checkpoint[key],original.checkpoint[key]);
  }
  checkCoverage(candidate,original);
  const resumed = await run({legacy:true});
  assert.equal(resumed.checkpoint.pairedNeckPrices,undefined);
  assert.deepEqual(resumed.receipts,original.receipts);
  for (const parameters of [{tie:true},{scarce:true},{enchanted:true},{purchased:true}]) {
    const actual = await run(parameters), control = await run({...parameters,certified:false});
    if (parameters.enchanted || parameters.purchased) assert.equal(actual.checkpoint.pairedNeckPrices,undefined);
    checkCoverage(actual,control);
    if (parameters.enchanted || parameters.purchased) assert.deepEqual(actual.receipts,control.receipts);
  }
});

test('one certified ring and a worn neck can exchange ratings while the other ring keeps its own effects', async () => {
  const gem = id => ({key:String(id),kind:'gem',simulationId:id,consumableItemId:id});
  const haste = new Map([[115804,2],[130216,3],[130220,4]]);
  const choices = [...haste.keys()].map(gem), unknown = gem(999999);
  const sourceUpdatedAt = new Date().toISOString();
  const knownRing = 'FINGER_2', otherRing = 'FINGER_1';
  const group = c => {
    const fixed = c.slots.find(s => s.slotType === otherRing).gemIds[0];
    const amount = c.slots.filter(s => s.slotType !== otherRing).reduce((v,s) => v + (haste.get(s.gemIds[0]) ?? 0),0);
    return [fixed,amount];
  };
  async function run(mode, scarce = false, tied = false, wornRing = false) {
    const h = fixture({slots:3,limits:{simulations:12}});
    for (const [i,slot] of h.input.slots.entries()) slot.slotType = [otherRing,knownRing,'NECK'][i];
    Object.assign(h.input.slots[2],{owned:true,allowOwnedChanges:true,ownedItemId:123});
    if (wornRing) {
      Object.assign(h.input.slots[1],{owned:true,allowOwnedChanges:true,ownedItemId:124});
      h.input.bareOwnedRingRatings = new Set([knownRing]);
    }
    h.input.catalog.resolve = slot => ({verified:true,enchantApplicable:slot.slotType === knownRing,enchantChoices:[],
      gemChoices:{'0':slot.slotType === otherRing ? [unknown,choices[0]] : choices}});
    h.input.prices = {sourceUpdatedAt,prices:Object.fromEntries([...choices,unknown].map(e => [e.consumableItemId,
      {ladder:[[!tied && e.simulationId === 130216 ? 9 : 1,scarce && e.simulationId === 115804 ? 1 : 4]]}]))};
    h.input.ratingOwnedNeck = true;
    h.input.ratingRingSlots = new Set([knownRing]);
    h.input.ringNeckPricePairs = mode === 'on';
    h.input.simulate = async c => {
      h.calls.push(c); const [fixed,points]=group(c); return measurement(1100 + (fixed === unknown.simulationId ? 50 : 0) - (6-points)**2);
    };
    const first = mode === 'restore' ? await optimizeAuctionGearEnhancements(h.input) : undefined;
    if (first) h.input.ringNeckPricePairs = true;
    const result = await complete(h,first);
    return {rows:h.calls,cp:result.checkpoint};
  }
  const ordinary=await run('off'), candidate=await run('on');
  assert.equal(candidate.cp.ringNeckPricePairs,true);
  assert.equal(candidate.cp.pairedRingPrices,undefined);
  assert(candidate.rows.length < ordinary.rows.length);
  const check = (actual,control) => {
    const keys = new Set(actual.rows.map(c=>c.key));
    for(const row of control.rows) if(!keys.has(row.key)){
      assert(actual.rows.some(c => c.totalCopper < row.totalCopper && String(group(c)) === String(group(row))));
    }
    for(const key of ['bestDpsConfirmed','bestValueConfirmed']) assert.deepEqual(actual.cp[key],control.cp[key]);
  };
  check(candidate,ordinary);
  for(const [scarce,tied] of [[true,false],[false,true]]) {
    const gold=await run('off',scarce,tied), trial=await run('on',scarce,tied);
    check(trial,gold);
    if(tied) {
      const equalCost = rows => rows.filter(c => group(c)[1] === 6).map(c=>c.key);
      assert.deepEqual(equalCost(trial.rows),equalCost(gold.rows));
    }
  }
  assert.deepEqual((await run('restore')).rows,ordinary.rows);
  const worn=await run('on',false,false,true);
  assert.equal(worn.cp.ringNeckPricePairs,undefined);
  assert.deepEqual(worn.rows,(await run('off',false,false,true)).rows);
});

test('head and armor exchanges honor ties, stock, slot restrictions, and the restored traversal', async () => {
  const enchant = (id, extra = {}) => ({key:String(id),kind:'enchant',consumableItemId:id,simulationId:id,...extra});
  const run = async ({headCost=4, shoulderCost=5, freeCost=8, shared=false, restricted=false,
    flags=true, installed=false, stock=true, resume=false, lowerDigits=false} = {}) => {
    const options = {HEAD:[enchant(7989,restricted ? {category:{id:'class',limit:1}} : {})],
      SHOULDER:[enchant(7970),enchant(7971)]};
    if (shared) options.WRIST=[enchant(99999,{consumableItemId:7971})];
    if (lowerDigits) options.CHEST=[enchant(12345)];
    const slots=Object.keys(options).map(slotType=>({slotType,variantKey:slotType,metadataKey:'verified',sockets:[],
      owned:installed && slotType==='HEAD', ...(installed && slotType==='HEAD' ?
        {ownedItemId:123,allowOwnedChanges:true,installed:{gems:[],enchant:enchant(98765)}} : {})}));
    const prices={7989:{ladder:[[headCost,1]]},7970:{ladder:[[shoulderCost,1]]},12345:{ladder:[[2,1]]},
      ...(stock ? {7971:{ladder:[[freeCost,1]]}} : {})};
    const calls=[];
    const h={input:{...fixture().input,slots,catalog:{version:'paired-armor',complete:true,resolve:slot=>({
      verified:true,enchantApplicable:true,enchantChoices:options[slot.slotType],gemChoices:{}})},
      prices:{sourceUpdatedAt:new Date().toISOString(),prices},bareArmorSlots90:flags ? new Set(['HEAD','SHOULDER']) : undefined,
      simulate:async config=>{calls.push(config.slots.map(s=>s.enchantId).join('/'));return measurement();}}};
    const legacy=resume && await optimizeAuctionGearEnhancements({...h.input,bareArmorSlots90:undefined});
    const result=await complete(h,legacy || undefined);
    return {calls,checkpoint:result.checkpoint};
  };
  const proof=await run({lowerDigits:true});
  assert.equal(proof.calls.length,10);
  assert.deepEqual(proof.checkpoint.armorPricePruning,{branches:'1',configurations:'2'});
  assert(!proof.calls.includes('0/7989/7970'));
  for (const params of [{headCost:3},{shared:true},{restricted:true},{flags:false},{resume:true}]) {
    const result=await run(params);
    assert.equal(result.checkpoint.pairedArmorPrices,undefined);
    assert(result.calls.some(key=>key.startsWith('7989/7970')));
  }
  assert((await run({installed:true})).calls.includes('7989/7970'));
  assert((await run({stock:false})).calls.includes('7989/7970'));
  const reverse=await run({freeCost:10});
  assert(reverse.calls.includes('7989/7970'));
  assert(!reverse.calls.includes('0/7971'));
});

test('every skipped three-slot armor receipt has a cheaper measured receipt with identical stats', async () => {
  // Base-256 digits represent speed, leech, avoidance, and stamina. The
  // complete three-slot total in each digit is smaller than the base.
  const stat = {speed:1,leech:256,avoid:256**2,stamina:256**3};
  const ratings = {
    HEAD:{7988:9*stat.speed,7989:13*stat.speed,7958:22*stat.leech,7959:33*stat.leech,8014:15*stat.avoid,8015:22*stat.avoid},
    SHOULDER:{7970:26*stat.speed,7971:39*stat.speed,7972:52*stat.speed,7973:65*stat.speed,
      8028:66*stat.leech,8029:99*stat.leech,8030:132*stat.leech,7999:67*stat.avoid,8000:89*stat.avoid,8001:111*stat.avoid},
    FEET:{7962:186*stat.stamina+15*stat.avoid,7992:186*stat.stamina+22*stat.leech,8018:186*stat.stamina+9*stat.speed},
  };
  const slots=Object.keys(ratings).map(slotType=>({slotType,variantKey:slotType,metadataKey:'armor',sockets:[],owned:false}));
  const options=Object.fromEntries(Object.entries(ratings).map(([slot,stats])=>[slot,Object.keys(stats).map(Number).map(id=>({
    key:String(id),simulationId:id,consumableItemId:id,kind:'enchant'}))]));
  for (const ascending of [true,false]) {
    const prices=Object.fromEntries(Object.values(options).flat().map(e=>[e.simulationId,{ladder:[[ascending ? e.simulationId-7900 : 8100-e.simulationId,1]]}]));
    const tracked=new Map();
    const h={input:{...fixture().input,slots,bareArmorSlots90:new Set(Object.keys(ratings)),
      limits:{configurations:1024,simulations:12},prices:{prices,sourceUpdatedAt:new Date().toISOString()},budgetCopper:10000,itemsCopper:0,
      catalog:{version:'all-armor',complete:true,resolve:s=>({verified:true,enchantApplicable:true,enchantChoices:options[s.slotType],gemChoices:{}})},
      simulate:async c=>{tracked.set(c.slots.map(s=>s.enchantId).join('/'),c.totalCopper);return measurement();}}};
    await complete(h);
    const receipts=[], minima=new Map();
    for (const foot of [0,...Object.keys(ratings.FEET).map(Number)])
      for (const head of [0,...Object.keys(ratings.HEAD).map(Number)])
        for (const shoulder of [0,...Object.keys(ratings.SHOULDER).map(Number)]) {
          const ids=[foot,head,shoulder], key=ids.join('/');
          const vector=(ratings.FEET[foot]??0)+(ratings.HEAD[head]??0)+(ratings.SHOULDER[shoulder]??0);
          const price=ids.reduce((n,id)=>n+(prices[id]?.ladder[0][0]??0),0);
          if (tracked.has(key)) assert.equal(tracked.get(key),price);
          receipts.push({key,vector,price});
          minima.set(vector,Math.min(price,minima.get(vector)??Infinity));
        }
    assert(tracked.size<receipts.length);
    for (const {key,vector,price} of receipts) if (price===minima.get(vector)) assert(tracked.has(key),key);
  }
});

test('two bare rings price scroll exchanges using exact stock while every socket stays fixed', async () => {
  const ringSlots=['FINGER_1','FINGER_2'];
  const one=5297,two=5428,three=6553;
  const enchant=(id,extra={})=>({key:String(id),kind:'enchant',consumableItemId:id,simulationId:id,...extra});
  async function search({ladder=[[4,2]],restricted=false,external=false,enabled=true,resume=false,socket=false}={}) {
    const labels=external ? [...ringSlots,'WRIST'] : ringSlots;
    const slots=labels.map(slotType=>({slotType,owned:false,variantKey:slotType,metadataKey:'ring-snapshot',sockets:socket && slotType==='FINGER_1' ? [{key:'0',type:'14'}] : []}));
    const prices={8000:{ladder:[[1,1]]},[one]:{ladder:[[3,2]]},[two]:{ladder},[three]:{ladder:[[6,2]]}};
    const seen=new Map();
    const h={input:{...fixture().input,slots,bareRingScrolls90:enabled,limits:{simulations:12},
      catalog:{version:'scrolls',complete:true,resolve:s=>({verified:true,enchantApplicable:true,gemChoices:s.sockets.length ? {'0':gems(1)} : {},
        enchantChoices:s.slotType==='WRIST' ? [enchant(12345,{consumableItemId:two})] :
          [enchant(one),enchant(two,restricted ? {category:{id:'limited',limit:1}} : {}),enchant(three)]})},
      prices:{prices,sourceUpdatedAt:new Date().toISOString()},itemsCopper:0,simulate:async c=>{
        const gem=socket ? '|'+(c.slots[0].gemIds[0]??0) : '';
        seen.set(c.slots.map(s=>s.enchantId).join('/')+gem,c.totalCopper);return measurement();}}};
    const old=resume && await optimizeAuctionGearEnhancements({...h.input,bareRingScrolls90:false});
    await complete(h,old || undefined);return seen;
  }
  const cheaper=await search();
  assert.equal(cheaper.get(two+'/'+two),8);
  assert(!cheaper.has(one+'/'+three) && !cheaper.has(three+'/'+one));
  for(const args of [{ladder:[[4,1],[5,1]]},{ladder:[[4,1]]},{restricted:true},{enabled:false},{resume:true}]) {
    const all=await search(args);
    assert.equal(all.get(one+'/'+three),9);
    assert.equal(all.get(three+'/'+one),9);
  }
  const reversed=await search({ladder:[[4,1],[8,1]]});
  assert(!reversed.has(two+'/'+two));
  const withGem=await search({socket:true});
  for (const gem of [0,8000]) {
    assert(withGem.has(two+'/'+two+'|'+gem));
    assert(!withGem.has(one+'/'+three+'|'+gem));
  }
  const shared=await search({external:true});
  assert.equal(shared.get(one+'/'+three+'/12345'),13);
});

test('exact finalist tie pruning preserves the preferred physical receipt at every price and combat identity', async()=>{
  const date=new Date().toISOString(), ringNames=['FINGER_1','FINGER_2'];
  const gems=[115804,130220,115803].map(id=>({key:'gem-'+id,kind:'gem',simulationId:id,consumableItemId:id}));
  const scrolls=[8020,7994].map(id=>({key:'scroll-'+id,kind:'enchant',simulationId:id,consumableItemId:id+100000}));
  const rawKey=c=>JSON.stringify(c.slots.map(s=>[s.slotType,s.enchantId,s.gemIds]));
  const combatKey=c=>{
    const [back,...jewelry]=c.slots;
    const gems=jewelry.flatMap(s=>s.gemIds).sort((a,b)=>a-b);
    return JSON.stringify([back.gemIds,gems,jewelry.map(s=>s.enchantId).sort((a,b)=>a-b)]);
  };
  async function run({enable=true,key=combatKey,legacy=false,restricted=false}={}) {
    const h=fixture({slots:4,limits:{simulations:12,configurations:64}});
    h.input.slots.forEach((s,i)=>{s.slotType=['BACK',...ringNames,'NECK'][i];});
    h.input.ratingRingSlots=new Set(ringNames);h.input.ratingOwnedNeck=true;
    h.input.catalog.resolve=s=>({verified:true,enchantApplicable:ringNames.includes(s.slotType),enchantChoices:scrolls,
      gemChoices:{'0':s.slotType==='BACK'?[gems[0]]:restricted&&s.slotType==='FINGER_2'?[gems[1]]:gems}});
    h.input.prices={sourceUpdatedAt:date,prices:Object.fromEntries([...gems,...scrolls].map(e=>
      [e.consumableItemId,{ladder:e===gems[0]?[[2,1],[8,1]]:[[3,4]]}]))};
    h.input.budgetCopper=75;
    const seen=new Map(),byCost=new Map(),keys=[];
    h.input.preciseReceiptKey=enable?key:undefined;
    h.input.simulate=async c=>measurement(1100+parseInt(createHash('sha256').update(key(c)).digest('hex').slice(0,3),16));
    h.input.onMeasured=c=>{
      const k=JSON.stringify([key(c),c.totalCopper]);
      keys.push(c.key);
      if(!seen.has(k)||c.key.localeCompare(seen.get(k))<0)seen.set(k,c.key);
      byCost.set(c.key,c.totalCopper);
    };
    const first=legacy?await optimizeAuctionGearEnhancements({...h.input,preciseReceiptKey:undefined}):undefined;
    const {checkpoint}=await complete(h,first);
    return {seen,keys,byCost,checkpoint};
  }
  for(const restricted of [false,true]){
    const oracle=await run({enable:false,restricted}), test=await run({restricted});
    assert.deepEqual(test.seen,oracle.seen);
    assert(test.keys.length<oracle.keys.length);
    assert.deepEqual(test.checkpoint.jewelryTiePruning,{branches:String(oracle.keys.length-test.keys.length),
      configurations:String(oracle.keys.length-test.keys.length)});
    assert.equal(new Set(test.keys).size,test.keys.length);
    for(const winner of ['bestDpsConfirmed','bestValueConfirmed'])assert.deepEqual(test.checkpoint[winner],oracle.checkpoint[winner]);
    for(const [key,price] of test.byCost)assert.equal(price,oracle.byCost.get(key));
  }
  const raw=await run({enable:false,key:rawKey}),distinct=await run({key:rawKey});
  assert.deepEqual(distinct.keys,raw.keys,'A position-dependent effect keeps both arrangements');
  // Only moving a gem together with its scroll preserves this score key.
  // Each individual exchange produces a different independent finalist.
  const ringPairs=c=>{
    const [back,left,right,neck]=c.slots;
    if (!left.enchantId || !right.enchantId || left.enchantId===right.enchantId ||
        !left.gemIds[0] || !right.gemIds[0] || left.gemIds[0]===right.gemIds[0]) return rawKey(c);
    const pairs=[left,right].map(slot=>[slot.enchantId,slot.gemIds[0]]).sort((a,b)=>a[0]-b[0]);
    return JSON.stringify([back.gemIds,pairs,neck.gemIds]);
  };
  const allPairs=await run({enable:false,key:ringPairs}), joint=await run({key:ringPairs});
  assert.deepEqual(joint.seen,allPairs.seen);
  assert(joint.keys.length<allPairs.keys.length);
  assert.equal(joint.checkpoint.tiedJewelryReceipts,'ring_and_gem');
  for(const winner of ['bestDpsConfirmed','bestValueConfirmed'])assert.deepEqual(joint.checkpoint[winner],allPairs.checkpoint[winner]);
  const restored=await run({legacy:true});
  assert.deepEqual(restored.keys,(await run({enable:false})).keys);
  assert.equal(restored.checkpoint.tiedJewelryReceipts,undefined);
});
