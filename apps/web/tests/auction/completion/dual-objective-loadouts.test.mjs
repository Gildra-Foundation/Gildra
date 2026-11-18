/** Exact planner and presentation contracts with isolated synthetic measurements. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assembleAuctionGear,captureAuctionGearIncumbents} from '../../../lib/wow/auctionGearPlanner.ts';
import {auctionGearResults,auctionGearLoadoutComparison} from '../../../lib/wow/auctionGearResult.ts';
const measurement=(dps,dpsError=1)=>({dps,dpsError,confidence:95,iterations:750,engine:'SimulationCraft dual-objective fixture'});
const option=(id,slot,cost)=>({id:String(id),auctionId:id,quantity:1,costCopper:cost,variantKey:'exact',candidate:{entityId:`fixture-${id}`,itemId:id,name:`Synthetic ${id}`,slotType:slot,itemLevel:100,inventoryType:slot==='HEAD'?1:5,itemClassId:4,itemSubclassId:4,eligible:true,rejectionReasons:[],season:{id:'s',patch:'p',expansionId:11,activityNames:[]},source:{type:'auction',evidence:'fixture'},constraints:{uniqueEquipped:false,crafted:false,allowableClassMask:'0',requiredLevel:1},compatibility:{specId:72,method:'specialization',itemClassId:4,itemSubclassId:4},variants:[{key:'exact',itemLevel:100,contextId:0,bonusIds:[]}]}});
const options=[option(1,'HEAD',10),option(2,'HEAD',70),option(3,'HEAD',90),option(4,'CHEST',30)];
function fixture(objective='value'){
 let calls=0;const simulate=async selection=>{calls++;const ids=selection.map(o=>o.auctionId);if(ids.includes(3))return measurement(2000,5000);if(ids.includes(2)&&ids.includes(4))return measurement(1400);if(ids.includes(1)&&ids.includes(4))return measurement(1180);return measurement(ids.includes(2)?1200:ids.includes(4)?1150:ids.includes(1)?1100:1000);};
 const input={searchId:'synthetic-dual',objective,budgetCopper:100,options,selectedSlots:['HEAD','CHEST'],loadout:[],specId:72,market:{sourceUpdatedAt:new Date().toISOString()},signal:new AbortController().signal,simulate};
 return{input,get calls(){return calls;}};
}
const ids=plan=>plan?.purchases.map(item=>item.auctionId).sort((a,b)=>a-b);
async function finish(h,checkpoint,maxNewSimulations=1){let step;for(let i=0;i<40;i++){step=await assembleAuctionGear({...h.input,checkpoint,maxNewSimulations});checkpoint=structuredClone(step.checkpoint);if(step.result.exhaustiveComplete)return step;}assert.fail('bounded fixture did not complete');}
for(const objective of ['value','dps'])test(`${objective} search retains both confirmed leaders independently of its noisy measured maximum`,async()=>{
 const h=fixture(objective),step=await finish(h);assert.deepEqual(ids(step.result),[3]);assert.equal(step.result.comparison.uncertainty.significant,false);
 assert.deepEqual(ids(step.result.bestValueConfirmed),[1]);assert.deepEqual(ids(step.result.bestDpsConfirmed),[2,4]);
 assert.deepEqual(ids(step.result.bestConfirmed),objective==='value'?[1]:[2,4]);
 assert.equal(step.result.bestValueConfirmed.spentCopper,10);assert.equal(step.result.bestDpsConfirmed.spentCopper,100);assert.equal(step.result.bestDpsConfirmed.remainingCopper,0);
 assert.equal(h.calls,7,'same baseline and six feasible effect sets; retaining both objectives adds no simulation');
 const calls=h.calls,resumed=await assembleAuctionGear({...h.input,checkpoint:structuredClone(step.checkpoint)});assert.equal(h.calls,calls);assert.deepEqual(resumed.result.bestDpsConfirmed,step.result.bestDpsConfirmed);
 const incumbents=captureAuctionGearIncumbents(step.checkpoint,options);assert.equal(incumbents.length,3,'noisy maximum and both distinct confirmed leaders survive pool replacement');
 const pair=auctionGearLoadoutComparison(auctionGearResults({...step.result,enhancementMode:'equipment'}));assert.deepEqual(ids(pair.value),[1]);assert.deepEqual(ids(pair.dps),[2,4]);assert.equal(pair.dps.totalCopper,100);
});
test('legacy objective-specific checkpoint replays cached combinations before restoring independent maximum',async()=>{
 const h=fixture(),complete=await finish(h),legacy=structuredClone(complete.checkpoint);delete legacy.bestValueConfirmed;delete legacy.bestDpsConfirmed;
 assert.deepEqual(legacy.bestConfirmed.optionIds,['1']);assert.deepEqual(legacy.best.optionIds,['3']);const calls=h.calls;
 let step=await assembleAuctionGear({...h.input,checkpoint:legacy,maxAssignments:1});assert.equal(step.result.exhaustiveComplete,false,'old completed cursor cannot falsely certify a missing historical objective');
 step=await finish(h,step.checkpoint);assert.equal(h.calls,calls,'replay uses exact cached native measurements');assert.deepEqual(ids(step.result.bestDpsConfirmed),[2,4]);assert.deepEqual(ids(step.result.bestValueConfirmed),[1]);
});
test('independent retained candidates are revalidated and an aborted resume cannot mutate its checkpoint',async()=>{
 const h=fixture(),step=await finish(h);const invalid=structuredClone(step.checkpoint);invalid.bestDpsConfirmed.simulation=measurement(1001,1000);
 await assert.rejects(assembleAuctionGear({...h.input,checkpoint:invalid}),/invalid_search_checkpoint/);
 const snapshot=structuredClone(step.checkpoint),controller=new AbortController();controller.abort();await assert.rejects(assembleAuctionGear({...h.input,checkpoint:step.checkpoint,signal:controller.signal}),{name:'AbortError'});assert.deepEqual(step.checkpoint,snapshot);
});
test('comparison requires two distinct significant priced configurations with a real DPS tradeoff',async()=>{
 const h=fixture(),step=await finish(h),rows=auctionGearResults({...step.result,enhancementMode:'equipment'});const pair=auctionGearLoadoutComparison(rows);assert(pair);
 assert.equal(auctionGearLoadoutComparison([pair.value]),null);
 assert.equal(auctionGearLoadoutComparison([pair.value,{...pair.dps,significant:false}]),null);
 assert.equal(auctionGearLoadoutComparison([pair.value,{...pair.dps,totalCopper:null}]),null);
 assert.equal(auctionGearLoadoutComparison([pair.value,{...pair.dps,comparison:pair.value.comparison}]),null,'equal gains do not imply a second DPS improvement');
 const alias={...pair.dps,purchases:pair.value.purchases.map(p=>({...p,auctionId:p.auctionId+100}))};assert.equal(auctionGearLoadoutComparison([pair.value,alias]),null,'another physical copy is not another loadout');
});
