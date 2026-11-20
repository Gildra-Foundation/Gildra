// Synthetic algorithm fixtures, never live DPS/market claims.
import assert from 'node:assert/strict';
import test from 'node:test';
import { optimizeAuctionGearEnhancements } from '../../../lib/wow/auctionGearEnhancementOptimizer.ts';
import { purchasedRingGemEffect } from '../../../lib/wow/auctionGearMechanicalCache.ts';
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
  async function run({ladder=[[2,2]], restricted={}, own=false, effect=false, otherEnchant=false, legacy=false, installed=false, cheapId=cheap, dearId=dear, nativeLevel}={}) {
    const source=stageFixture().input.finalists[0].options[0];
    const c=source.candidate, variant=c.variants[0];
    Object.assign(c,{itemClassId:4,inventoryType:11});
    Object.assign(variant.resolution,{engine,nativeNoItemEffects:!effect});
    const h=fixture({choices:[gem(cheapId,restricted),gem(dearId)],slots:2});
    h.input.slots.forEach((slot,i)=>Object.assign(slot,{slotType:`FINGER_${i+1}`,owned:own,allowOwnedChanges:own}));
    if(installed) h.input.slots.push({slotType:'NECK',variantKey:'owned-neck',metadataKey:'owned-socket',owned:true,
      sockets:[{key:'0',type:'14'}],installed:{gems:[gem(cheapId,{uniqueEquipped:true})]}});
    const resolve=h.input.catalog.resolve;
    if(otherEnchant) h.input.catalog.resolve=slot=>({...resolve(slot),enchantApplicable:true,
      enchantChoices:[{key:'enchant',kind:'enchant',simulationId:5555,consumableItemId:12}]});
    h.input.prices.prices={[cheapId]:{ladder},[dearId]:{ladder:[[5,2]]},12:{ladder:[[1,10]]}};
    h.input.purchasedGemEffect=(slot,id,enchant)=>purchasedRingGemEffect({...source,candidate:{...c,slotType:slot}},engine,id,enchant,nativeLevel);
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
    assert.equal(pruned.evaluated.length, 5 ** rings);
    assert.deepEqual(pruned.result.ringPricePruning, { branches:rings === 1 ? "1" : "6", configurations:String(6 ** rings - 5 ** rings) });
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
