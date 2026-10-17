import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import * as planner from '../../../lib/wow/auctionGearPlanner.ts';
import {auctionGearVariantSelectionKey} from '../../../lib/wow/auctionGearExclusions.ts';

const engine='SimulationCraft assembly-chunk-fixture';
const measure=dps=>({dps,dpsError:1,confidence:95,iterations:1000,engine});
const slotInventory={FINGER_1:11,FINGER_2:11,HEAD:1,CHEST:5,WRIST:9,FEET:8};
export const assemblySlots=Object.keys(slotInventory);
export function assemblyOption(auctionId,itemId,slotType,costCopper,quantity=1){
 return {id:`${auctionId}:${slotType}:base`,auctionId,quantity,costCopper,variantKey:'base',candidate:{
  itemId,name:`Synthetic ${itemId}`,slotType,inventoryType:slotInventory[slotType],itemClassId:4,itemSubclassId:slotType.startsWith('FINGER')?0:4,
  eligible:true,constraints:{uniqueEquipped:false},compatibility:{specId:72},variants:[{key:'base',itemLevel:100,contextId:0,bonusIds:[]}]}};
}
export function assemblyOptions(){
 return [assemblyOption(100,100, 'FINGER_1',20,2),assemblyOption(100,100,'FINGER_2',20,2),
  assemblyOption(101,101,'FINGER_1',12),assemblyOption(101,101,'FINGER_2',12),
  ...['HEAD','CHEST','WRIST','FEET'].map((slot,index)=>assemblyOption(200+index,200+index,slot,10))];
}
export function fixtureDps(selection){
 const slots=new Set(selection.map(o=>o.candidate.slotType));
 return 1000-10*selection.length+(slots.has('HEAD')&&slots.has('CHEST')?100:0)+
  (selection.filter(o=>o.candidate.itemId===100).length===2?200:0)+(slots.size===assemblySlots.length?1000:0);
}

/** Real Runner/Planner/Effects; deterministic clock and discovery/native boundaries.
 * Storage spies check publication callbacks; dedicated persistence suites test IO.
 * No HTTP, filesystem state, native process or global Date mutation occurs. */
export async function assemblyRunnerFixture({nativeMs=0,discoveryMs=0}={}){
 const clock={now:0,nativeMs,discoveryMs},calls=[],seen=new Set();
 const state={pool:assemblyOptions(),engine,pending:discoveryMs?1:0,discoveryCalls:0,saves:0,flushes:0};
 class FixtureDate extends Date {static now(){return clock.now;}}
 const coverage=()=>({discoveryComplete:state.pending===0,dataComplete:true});
 const source=await readFile(new URL('../../../lib/wow/auctionGearRunner.ts',import.meta.url),'utf8');
 const stripped=stripTypeScriptTypes(source,{mode:'strip'}).replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
 const runner=new vm.Script(stripped+'\n;({assembleAuctionGearSearch,selectedAuctionGearAssemblyOptions})').runInNewContext({
  ...planner,auctionGearVariantSelectionKey,Date:FixtureDate,Map,Set,Object,Number,JSON,AbortSignal,process,
  scheduleAuctionGearSearchSave:()=>state.saves++,flushAuctionGearSearch:async()=>state.flushes++,
  schedulePlannerItemIcons:()=>{},auctionGearDiscoveryOptions:()=>state.pool,
  auctionGearDiscoveryCoverage:coverage,
  advanceAuctionGearDiscovery:async(_discovery,input)=>{
   assert(input.maxSteps<=4,'Assembly discovery must remain bounded');state.discoveryCalls++;
   if(state.pending&&!input.shouldYield?.()){clock.now+=clock.discoveryMs;state.pending--;input.onCheckpoint?.();}
  },
 });
 const context={input:{objective:'value',budgetCopper:100,selectedSlots:assemblySlots,scenario:'single-target'},
  options:state.pool,loadout:[],specId:72,specSlug:'fury-warrior',currentBySlot:new Map(),
  market:{sourceUpdatedAt:new Date().toISOString()},coverage:coverage(),searchLimited:false,
  discovery:{engine},character:{level:81,region:'eu'},publicMarket:{},profileFingerprint:'synthetic',
  simulate:async selection=>{
   const key=planner.auctionSelectionEffectKey(selection);
   assert(!seen.has(key),'Exact native effect must not rerun after checkpoint/price/selection changes');seen.add(key);
   calls.push({key,slots:selection.map(o=>o.candidate.slotType),itemIds:selection.map(o=>o.candidate.itemId)});
   clock.now+=clock.nativeMs;return measure(fixtureDps(selection));
  }};
 const baseline=measure(1000);
 const entry={id:'synthetic-bounded-assembly',owner:'synthetic',context,busy:false,
  retainedBaseline:baseline,retainedSimulationCache:{[planner.auctionSelectionEffectKey([])]:baseline},
  knownOptionIds:new Set(state.pool.map(o=>o.id)),knownVariantKeys:new Set(),
  latestSearchResult:{kind:'search',searchComplete:true,items:[],baseline}};
 async function step(selection){
  const before=calls.length,start=clock.now;
  const result=await runner.assembleAuctionGearSearch(entry,selection,new AbortController().signal,()=>{},'synthetic');
  return {result,newCalls:calls.length-before,elapsed:clock.now-start};
 }
 return {runner,entry,context,state,clock,calls,step};
}

/** Separate raw assignment/cost oracle: no planner cost/allocation helper. */
export function independentOptimum(options,budget=100){
 let best=null;
 const visit=(index,selection)=>{
  if(index<assemblySlots.length){visit(index+1,selection);for(const o of options.filter(o=>o.candidate.slotType===assemblySlots[index]))visit(index+1,[...selection,o]);return;}
  const lots=new Map();for(const o of selection){const lot=lots.get(o.auctionId)??{used:0,quantity:o.quantity,cost:o.costCopper};if(++lot.used>lot.quantity)return;lots.set(o.auctionId,lot);}
  const cost=[...lots.values()].reduce((sum,o)=>sum+o.cost,0),delta=fixtureDps(selection)-1000;
  if(cost>budget||delta<=1.96*Math.SQRT2)return;
  const value=cost/delta;
  if(!best||value<best.value||value===best.value&&delta>best.delta)best={value,cost,delta,ids:selection.map(o=>o.id).sort()};
 };
 visit(0,[]);return best;
}
