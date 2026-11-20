import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { serialize } from 'node:v8';
import { createAuctionGearEnhancedLoadoutIterator } from '../../../lib/wow/auctionGearEnhancedLoadouts.ts';
import { compareGearSimulationResults } from '../../../lib/wow/gearSimulation.ts';
import { assertFreshMarket } from '../../../lib/wow/auctionMarket.ts';
import { readAuctionState, writeAuctionState } from '../../../lib/wow/auctionGearPersistence.ts';

const source = await readFile(new URL('../../../lib/wow/auctionGearExhaustiveEnhancements.ts',import.meta.url),'utf8');
const code=stripTypeScriptTypes(source.replace(/^import[\s\S]*?;\n/gm,'')).replace(/^export /gm,'');
const storeSource=await readFile(new URL('../../../lib/wow/auctionGearSearchStore.ts',import.meta.url),'utf8');
const storeCode=storeSource.slice(storeSource.indexOf('function storedEntry('),storeSource.indexOf('export function saveAuctionGearSearch('));
const storedEntry=vm.runInNewContext(stripTypeScriptTypes(storeCode)+';storedEntry',{snapshotAuctionGearContext:()=>({})});
const simulation=dps=>({dps,dpsError:1,iterations:750,confidence:95,engine:'SimulationCraft synthetic-state'});
function fixture() {
  const h={price:10,stale:false,partial:false,stageCalls:[],slice:0,abortAfterQuotes:false};
  const quote=async()=>({prices:h.prices ?? {'1':{ladder:[[h.price,100]]}},sourceUpdatedAt:h.stale?'2000-01-01T00:00:00Z':new Date().toISOString(),fetchedAt:new Date().toISOString()});
  const advance=vm.runInNewContext(code+';advanceAuctionGearExhaustiveEnhancements',{
    createHash,createAuctionGearEnhancedLoadoutIterator,assertFreshMarket,structuredClone,compareGearSimulationResults,
    auctionGearSlots:['HEAD'],auctionEnhancementCatalogInfo:{revision:'synthetic-state-v1'},exactCommodityPrices:quote,
    evaluateAuctionEnhancementStage:async input=>{
      const options=input.finalists[0].options,key=options.map(o=>o.id).join()||'baseline';
      h.stageCalls.push(key);h.slice++;
      const ids=h.dependencies?.[key] ?? [1];
      input.onPriceDependencies(ids);
      input.state.quotes=await quote();input.state.quotedItemIds=[...new Set([...(input.state.quotedItemIds??[]),...ids])];
      const cost=h.prices ? ids.reduce((sum,id)=>sum+(h.prices[id]?.ladder[0][0]??Infinity),0) : h.price;
      input.state.checkpoints.current={nativeFacts:'preserved',key};
      if(h.abortAfterQuotes)throw new DOMException('Aborted','AbortError');
      const spent=options.reduce((sum,o)=>sum+o.costCopper,0),dps=h.scores?.[key]??1000+(options[0]?.candidate.itemId??0)*(h.scale??1);
      const recommendation={label:'synthetic',optionIds:options.map(o=>o.id),purchases:[],consumableNames:{},simulation:{...simulation(dps),iterations:h.iterations??750,dpsError:h.errors?.[key]??1},
        comparison:{deltaDps:dps-1000,candidateDps:dps,uncertainty:{significant:dps>1000}},
        configuration:{key,status:'priced',itemsCopper:spent,totalCopper:spent+cost,fullyEnhanced:false,consumables:[],slots:[],sourceUpdatedAt:input.state.quotes.sourceUpdatedAt}};
      return{complete:!h.partial,status:h.stale?'unavailable':spent+cost>input.budgetCopper?'no_affordable_configuration':'ready',searchLimited:true,recommendations:h.stale||spent+cost>input.budgetCopper?[]:[recommendation],reasons:h.stale?['market_unverified']:[],traversal:'exhaustive'};
    },
  });
  const options=[1,2,3].map(id=>({id:`option-${id}`,auctionId:id,costCopper:100,quantity:1,variantKey:'variant',
    candidate:{itemId:id,name:'Synthetic',slotType:'HEAD',inventoryType:1,itemClassId:4,itemSubclassId:4,itemLevel:150,
      constraints:{uniqueEquipped:false,crafted:false,allowableClassMask:'1',requiredLevel:1},eligible:true,rejectionReasons:[],
      compatibility:{specId:72,method:'specialization',itemClassId:4,itemSubclassId:4},variants:[{key:'variant',itemLevel:150,bonusIds:[],contextId:13}]}}));
  const input={options,selectedSlots:['HEAD'],equipment:{equipped_items:[{slot:{type:'HEAD'},item:{id:999}}]},loadout:[{slotType:'HEAD',itemId:999,inventoryType:1,itemSubclassId:4}],
    specId:72,level:90,region:'eu',engine:'SimulationCraft synthetic-state',profileFingerprint:'synthetic-profile',encounter:{scenario:'single-target',fightLengthSeconds:120,targets:1},
    budgetCopper:1000,objective:'dps',baseline:simulation(1000),simulate:async()=>{throw Error('stage controls measurements')},
    signal:new AbortController().signal,shouldYield:()=>h.slice>=1,quote,onState:state=>{h.state=state;}};
  h.run=async()=>{h.slice=0;return advance({...input,state:h.state});};h.input=input;return h;
}
async function finish(h){let result;for(let i=0;i<12;i++){result=(await h.run()).result;if(result.complete)return result;}throw Error('fixture did not finish');}

test('durable store whitelist roundtrip resumes the same pending assignment and retains only three leaders',async()=>{
  const h=fixture();h.partial=true;await h.run();assert.deepEqual([...h.state.currentOptionIds],[]);assert.equal(h.state.equipmentChecked,0);
  assert.equal(process.env.GILDRA_AUCTION_STATE_DIR,undefined);const directory=await mkdtemp(join(tmpdir(),'gildra-exact-state-'));process.env.GILDRA_AUCTION_STATE_DIR=directory;
  try{
    const id=randomUUID();writeAuctionState('search',id,Date.now()+60000,storedEntry({id,owner:'synthetic',exhaustiveEnhancementState:h.state}),{metadata:{owner:'synthetic'}});
    h.state=readAuctionState('search',id).data.exhaustiveEnhancementState;
    assert.equal(h.state.stage.checkpoints.current.nativeFacts,'preserved');h.partial=false;
    const result=await finish(h);assert.equal(result.complete,true);assert.equal(result.equipmentChecked,4);
    assert.equal(result.recommendations[0].optionIds[0],'option-3');assert.equal(Object.keys(h.state.stage.checkpoints).length,0);
    assert.equal(h.stageCalls.filter(key=>key==='option-3').length,1);assert(result.recommendations.length<=3);
    const calls=h.stageCalls.length;await h.run();assert.equal(h.stageCalls.length,calls,'Completed unchanged domain is idempotent');
  }finally{delete process.env.GILDRA_AUCTION_STATE_DIR;await rm(directory,{recursive:true,force:true});}
});

test('enhances duplicate equipment once and reopens with the next cheapest receipt after an exclusion', async () => {
  const h = fixture();
  const copy = {...h.input.options[2], id: 'cheapest-copy', auctionId: 99, costCopper: 2};
  h.input.options.push(copy);
  const first = await finish(h);
  assert.equal(first.equipmentChecked, 4);
  assert.equal(first.recommendations[0].optionIds[0], copy.id);
  assert.equal(first.recommendations[0].configuration.itemsCopper, 2);
  assert(!h.stageCalls.includes('option-3'));
  h.input.options.pop();
  h.stageCalls.length = 0;
  h.state = structuredClone(h.state);
  const resumed = await finish(h);
  assert.equal(resumed.equipmentChecked, 4);
  assert.equal(resumed.recommendations[0].optionIds[0], 'option-3');
  assert.equal(resumed.recommendations[0].configuration.itemsCopper, 100);
  assert(!h.stageCalls.includes(copy.id));
});

test('price ladder changes reopen completed ranking while equal-price timestamps keep the exact cursor',async()=>{
  const h=fixture();await finish(h);const calls=h.stageCalls.length;
  h.state.stage.quotes.fetchedAt='2000-01-01T00:00:00Z';await h.run();assert.equal(h.stageCalls.length,calls);
  h.price=20;h.state.stage.quotes.fetchedAt='2000-01-01T00:00:00Z';const changed=await h.run();
  assert.equal(changed.result.complete,false);assert.equal(changed.result.equipmentChecked,1);assert(!changed.result.recommendations.some(row=>row.optionIds.includes('option-3')));
  const fresh=await finish(h);assert.equal(fresh.recommendations[0].configuration.totalCopper,120);
});

test('exclusion, budget, profile and option-price changes discard old global winners',async()=>{
  for(const change of [h=>{h.input.options=h.input.options.slice(0,2);},h=>{h.input.budgetCopper=900;},h=>{h.input.profileFingerprint='other-profile';},h=>{h.input.options[2].costCopper=150;}]){
    const h=fixture();await finish(h);const old=h.state.inputKey;change(h);const result=await h.run();
    assert.notEqual(h.state.inputKey,old);assert.equal(result.result.complete,false);assert.equal(result.result.equipmentChecked,1);
    assert(!result.result.recommendations.some(row=>row.optionIds.includes('option-3')));
  }
});

test('stale quotes never consume a set and fresh same-ladder retry resumes preserved facts without spinning',async()=>{
  const h=fixture();h.stale=true;await assert.rejects(h.run(),/market_stale/);
  assert.equal(h.state.equipmentChecked,0);assert.deepEqual([...h.state.currentOptionIds],[]);assert.equal(h.stageCalls.length,1);
  assert.equal(h.state.stage.checkpoints.current.nativeFacts,'preserved');h.stale=false;
  const result=await finish(h);assert.equal(result.complete,true);assert.equal(result.equipmentChecked,4);
  h.stale=true;h.state.stage.quotes.fetchedAt='2000-01-01T00:00:00Z';await assert.rejects(h.run(),/market_stale/);
});

test('a price mutation followed by abort cannot silently reuse the old global ranking',async()=>{
  const h=fixture();await h.run();await h.run();assert(h.state.dps);
  h.price=99;h.abortAfterQuotes=true;await assert.rejects(h.run(),{name:'AbortError'});
  assert.equal(h.state.dps.recommendation.configuration.totalCopper,110);
  h.abortAfterQuotes=false;const resumed=await h.run();assert.equal(resumed.result.equipmentChecked,1);
  assert(resumed.result.recommendations.every(row=>row.configuration.totalCopper===row.configuration.itemsCopper+99));
});

test('restored completion still validates the exact cursor proof',async()=>{
  const h=fixture();await finish(h);h.state.cursor.visited='0';
  await assert.rejects(h.run(),/invalid_search_checkpoint/);
});

test('only the two distinct close leaders are rechecked, with restart after the first measurement',async()=>{
  const h=fixture(), calls=[];
  h.input.options.push({...h.input.options[2],id:'same-effect-dearer',auctionId:4,costCopper:200});
  h.input.recheck=async(options)=>{
    calls.push(options[0].id); h.slice++;
    return {...simulation(options[0].id==='option-3'?1008.03:1008),iterations:3000,dpsError:0.2};
  };
  let pending;
  for(let i=0;i<12&&!calls.length;i++)pending=await h.run();
  assert.deepEqual(calls,['option-3']);assert.equal(pending.result.complete,false);
  assert.equal(pending.result.finalistRecheck,undefined);
  h.state=JSON.parse(JSON.stringify(h.state));
  const result=await finish(h);
  assert.deepEqual(calls,['option-3','option-2']);
  assert.deepEqual([...result.finalistRecheck.keys],calls);
  assert.equal(result.finalistRecheck.significant,false);
  for(const key of calls)assert.equal(result.recommendations.find(r=>r.configuration.key===key).simulation.iterations,3000);
  await h.run();assert.equal(calls.length,2);
});
test('separated leaders skip precision work and an under-iterated response cannot complete it',async()=>{
  const h=fixture();h.scale=20;
  h.input.recheck=async()=>assert.fail('unnecessary high-precision simulation');
  assert.equal((await finish(h)).finalistRecheck,undefined);
  const invalid=fixture();invalid.input.recheck=async()=>simulation(1500);
  await assert.rejects(finish(invalid),/invalid_simulation_result/);
  assert.equal(invalid.state.precise,undefined);
  invalid.input.recheck=async options=>({...simulation(options[0].id==='option-2'?1100:1050),iterations:3000});
  const result=await finish(invalid);
  assert.equal(result.finalistRecheck.significant,true);
  assert.equal(result.recommendations.find(r=>r.configuration.key==='option-2').comparison.deltaDps,100);
});

test('a competitive third is rechecked and retained when it confirms a larger DPS gain',async()=>{
  const h=fixture(),calls=[];
  h.scores={'option-1':1008,'option-2':1009,'option-3':1010};
  h.input.recheck=async options=>{
    calls.push(options[0].id);
    return {...simulation(options[0].id==='option-3'?1004:options[0].id==='option-2'?1005:1009),iterations:3000};
  };
  const result=await finish(h);
  assert.deepEqual(calls,['option-3','option-2','option-1']);
  assert.equal(result.finalistRecheck.significant,true);
  assert.equal(result.finalistRecheck.leaderKey,'option-1');
  assert.equal(result.finalistRecheck.preferredKey,'option-1');
  assert.equal(result.recommendations[0].configuration.key,'option-1');
  assert.equal(result.recommendations[0].simulation.iterations,3000);
  assert.deepEqual(Array.from(result.recommendations, row => row.label),
    ['exhaustive', 'exhaustive:alternative-1', 'exhaustive:alternative-2']);

  h.state = JSON.parse(JSON.stringify(h.state));
  for (const leader of [h.state.measured, h.state.runnerUp, h.state.nextMeasured, h.state.value, h.state.dps]) {
    if (leader) leader.recommendation.label = 'exhaustive:alternative-17';
  }
  const priorCalls = h.stageCalls.length;
  const restored = await h.run();
  assert.deepEqual(JSON.parse(JSON.stringify(restored.result)), JSON.parse(JSON.stringify(result)));
  assert.equal(h.stageCalls.length, priorCalls);
  assert.equal(calls.length, 3);
});

test('100 gold: a competing 87.15 gold third requires precision before selecting among three directly checked prices',async()=>{
  const h=fixture(),calls=[];
  h.price=0;h.input.budgetCopper=1_000_000;
  h.input.baseline={...simulation(180267.23038),dpsError:236};
  const costs=[871500,27600,99600];
  h.input.options.forEach((row,i)=>{row.costCopper=costs[i];});
  h.scores={baseline:h.input.baseline.dps,'option-1':181169.566,'option-2':181175,'option-3':181180};
  h.errors={'option-1':237.354,'option-2':237,'option-3':237};
  const precise={'option-1':180850,'option-2':180820.456,'option-3':180834.903};
  h.input.recheck=async options=>{
    calls.push(options[0].id);h.slice++;
    return {...simulation(precise[options[0].id]),dpsError:118.925,iterations:3000};
  };
  let step;
  while(calls.length<2)step=await h.run();
  assert.equal(step.result.complete,false);
  h.state=JSON.parse(JSON.stringify(h.state));
  const result=await finish(h);
  assert.deepEqual(calls,['option-3','option-2','option-1']);
  assert.deepEqual([...result.finalistRecheck.keys],calls);
  assert.equal(result.finalistRecheck.leaderKey,'option-1');
  assert.equal(result.finalistRecheck.indistinguishableKeys.length,3);
  assert.equal(result.finalistRecheck.preferredKey,'option-2');
  assert.equal(result.recommendations[0].configuration.totalCopper,27600);
  assert.equal(result.recommendations[0].simulation.iterations,3000);
  await h.run();assert.equal(calls.length,3);
});

test('ties cannot chain through an intermediate finalist to the highest refined mean',async()=>{
  const h=fixture();
  h.input.options[0].costCopper=1; h.input.options[1].costCopper=9;
  h.scores={'option-1':1050,'option-2':1051,'option-3':1052};
  h.input.recheck=async options=>({...simulation({'option-1':1047,'option-2':1049,'option-3':1051}[options[0].id]),iterations:3000});
  const result=await finish(h);
  assert.deepEqual([...result.finalistRecheck.indistinguishableKeys],['option-3','option-2']);
  assert.equal(result.finalistRecheck.preferredKey,'option-2');
});

test('two refreshes during replay keep disjoint work and restore a previously unavailable winner and the value leader',async()=>{
  const h=fixture();
  h.dependencies={baseline:[], 'option-1':[1], 'option-2':[2], 'option-3':[2]};
  h.prices={1:{ladder:[[5,100]]}};
  h.input.objective='value';
  h.scores={'option-1':1080,'option-2':1100,'option-3':1200};
  const refresh=()=>{h.state.stage.quotes.fetchedAt='2000-01-01T00:00:00Z';};
  const first=await finish(h);
  assert.equal(first.recommendations[0].configuration.key,'option-1');
  const cursor=JSON.stringify(h.state.cursor);
  h.stageCalls.length=0;
  h.prices={...h.prices,2:{ladder:[[300,100]]}};refresh();
  const partial=await h.run();
  assert.equal(partial.result.complete,false);
  assert.equal(partial.result.equipmentChecked,3);
  assert.deepEqual(h.stageCalls,['option-2']);
  assert.equal(partial.result.recommendations[0].configuration.key,'option-1');
  h.state=JSON.parse(JSON.stringify(h.state));
  h.prices={...h.prices,1:{ladder:[[2000,100]]}};refresh();
  const second=await finish(h);
  assert.equal(JSON.stringify(h.state.cursor),cursor);
  assert.deepEqual(h.stageCalls,['option-2','option-1','option-3']);
  assert.equal(second.equipmentChecked,4);
  assert.equal(second.recommendations[0].configuration.key,'option-3');
  assert.equal(second.recommendations[0].configuration.totalCopper,400);
  h.stageCalls.length=0;
  h.prices={1:{ladder:[[5,100]]},2:{ladder:[[300,100]]}};refresh();
  const third=await finish(h);
  assert.deepEqual(h.stageCalls,['option-1']);
  assert.equal(third.recommendations[0].configuration.key,'option-1');
  assert(third.recommendations.some(row=>row.configuration.key==='option-3'));
});

test('legacy checkpoints preserve the exact completed result until their first changed ladder',async()=>{
  const h=fixture();await finish(h);delete h.state.priceGroups;delete h.state.rangeCount;
  h.stageCalls.length=0;h.state.stage.quotes.fetchedAt='2000-01-01T00:00:00Z';
  assert.equal((await h.run()).result.complete,true);assert.deepEqual(h.stageCalls,[]);
  h.price=15;h.state.stage.quotes.fetchedAt='2000-01-01T00:00:00Z';
  const result=await finish(h);
  assert.equal(result.recommendations[0].configuration.totalCopper,115);
  assert.deepEqual(h.stageCalls,['baseline','option-1','option-2','option-3']);
  assert.equal(h.state.rangeCount,1);
});

test('a long run of identical dependencies occupies one range and diverse overflow keeps exact fallback',async()=>{
  const make=(diverse)=>{
    const h=fixture(),original=h.input.options[0];
    h.input.shouldYield=()=>false;
    h.input.options=Array.from({length:64},(_,i)=>({...original,id:`option-${i+1}`,auctionId:i+1,
      candidate:{...original.candidate,itemId:i+1}}));
    if(diverse) h.dependencies=Object.fromEntries(h.input.options.map(option=>[option.id,[option.auctionId]]));
    return h;
  };
  const compact=make(false);
  const first=await finish(compact);
  assert.equal(first.equipmentChecked,65);
  assert.equal(compact.state.rangeCount,1);
  assert.deepEqual(JSON.parse(JSON.stringify(compact.state.priceGroups['1'].ordinals)),[['0','64']]);
  assert(serialize(compact.state).byteLength<20_000);
  const overflow=make(true);
  const before=await finish(overflow);
  assert.equal(before.equipmentChecked,65);
  assert.equal(overflow.state.priceGroups,undefined);
  assert(serialize(overflow.state).byteLength<20_000);
  overflow.state.stage.quotes.fetchedAt='2000-01-01T00:00:00Z';overflow.price=35;
  const after=await finish(overflow);
  assert.equal(after.recommendations[0].configuration.key,'option-64');
  assert.equal(after.recommendations[0].configuration.totalCopper,135);
});

test('a distant value finalist gets 750 iterations against the precise baseline and resumes without another fight',async()=>{
  const h=fixture(), calls=[];
  h.iterations=100;
  h.input.baseline={...simulation(1000),iterations:100};
  h.price=0;
  h.input.options.forEach((o,i)=>{o.costCopper=[1,500,600][i];});
  h.scores={baseline:1000,'option-1':1010,'option-2':1100,'option-3':1200};
  h.input.objective='value';
  h.input.recheckBaseline=async()=>{calls.push('baseline'); h.slice++; return simulation(1005);};
  h.input.recheck=async options=>{
    const key=options[0].id; calls.push(key); h.slice++;
    return simulation({'option-1':1012,'option-3':1190}[key]);
  };
  let result;
  for(let i=0;i<20;i++){
    result=(await h.run()).result;
    h.state=structuredClone(h.state);
    if(result.complete)break;
  }
  assert(result.complete);
  assert.deepEqual(calls,['baseline','option-3','option-1']);
  assert.deepEqual(result.recommendations.map(r=>r.configuration.key).join(','),'option-1,option-3');
  assert.deepEqual(result.recommendations.map(r=>r.comparison.deltaDps).join(','),'7,185');
  assert(result.recommendations.every(r=>r.simulation.iterations===750));
  await h.run();assert.equal(calls.length,3);
});

test('a sole unchanged finalist shares one independently verified baseline fight',async()=>{
  const h=fixture();
  h.input.options=[]; h.iterations=100; h.price=0;
  h.input.baseline={...simulation(1000),iterations:100};
  h.input.recheck=async()=>assert.fail('unchanged finalist already has its independent measurement');
  h.input.recheckBaseline=async()=>({...simulation(995),iterations:200});
  await assert.rejects(finish(h),/invalid_simulation_result/);
  assert.equal(h.state.preciseBaseline,undefined);
  let calls=0;
  h.input.recheckBaseline=async()=>{calls++;return simulation(995);};
  const result=await finish(h);
  assert.equal(calls,1);
  assert.equal(result.recommendations.length,1);
  assert.equal(result.recommendations[0].simulation.iterations,750);
  assert.equal(result.recommendations[0].comparison.deltaDps,0);
  assert.equal(result.finalistRecheck,undefined);
});

test('two enhanced finalist lanes preserve a successful sibling across retry',async()=>{
  const h=fixture(), calls=[];
  let active=0, peak=0, fail=true;
  h.iterations=100;
  h.input.baseline={...simulation(1000),iterations:100};
  h.input.simulationConcurrency=2;
  h.scores={baseline:1000,'option-1':1100,'option-2':1200,'option-3':1300};
  async function measure(key){
    calls.push(key);active++;peak=Math.max(peak,active);
    try{
      await new Promise(resolve=>setImmediate(resolve));
      if(key==='option-3' && fail)throw Error('worker busy');
      return simulation(h.scores[key]);
    }finally{active--;}
  }
  h.input.recheckBaseline=()=>measure('baseline');
  h.input.recheck=options=>measure(options[0].id);
  await assert.rejects(finish(h),/worker busy/);
  assert.equal(peak,2);assert.equal(active,0);
  assert.equal(h.state.preciseBaseline.dps,1000);assert.equal(h.state.precise?.['option-3'],undefined);
  h.state=structuredClone(h.state);fail=false;
  const result=await finish(h);
  assert.equal(result.complete,true);
  assert.deepEqual(calls,['baseline','option-3','option-3']);
  assert.equal(result.recommendations[0].simulation.iterations,750);
});
