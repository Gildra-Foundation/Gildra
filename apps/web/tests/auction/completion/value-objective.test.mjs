import assert from 'node:assert/strict';
import {assembleAuctionGear} from '../../../lib/wow/auctionGearPlanner.ts';
const option=(id,slot,copper)=>({id:String(id),auctionId:id,quantity:1,costCopper:copper,variantKey:'base',candidate:{itemId:id,name:`Synthetic ${id}`,slotType:slot,inventoryType:slot==='WRIST'?9:slot==='HEAD'?1:5,itemClassId:4,itemSubclassId:4,eligible:true,constraints:{uniqueEquipped:false},variants:[{key:'base',itemLevel:100,bonusIds:[],contextId:0}]}});
const cheap=option(1,'WRIST',40000),expensive=option(2,'WRIST',99000000);
const measurement=dps=>({dps,dpsError:1,confidence:95,iterations:1000,engine:'SimulationCraft objective-test'});
const input={searchId:'value-objective',budgetCopper:100000000,options:[cheap,expensive],selectedSlots:['WRIST'],loadout:[],specId:72,market:{sourceUpdatedAt:new Date().toISOString()},signal:new AbortController().signal,simulate:async s=>measurement(1000+(s[0]?.id==='1'?20:s.length?20.01:0))};
const value=await assembleAuctionGear({...input,objective:'value'});
assert.equal(value.result.bestConfirmed.spentCopper,40000,'Value mode must recommend 4 gold/+20 DPS over 9900 gold/+20.01 DPS');
assert.equal(value.result.objective,'value');
const maximum=await assembleAuctionGear({...input,objective:'dps'});
assert.equal(maximum.result.bestConfirmed.spentCopper,99000000,'Maximum-DPS remains an explicit supported objective');
assert.equal(maximum.result.objective,'dps');
const legacy=await assembleAuctionGear(input);
assert.equal(legacy.result.bestConfirmed.spentCopper,maximum.result.bestConfirmed.spentCopper,'Legacy absent objective preserves its maximum-DPS checkpoint semantics');
await assert.rejects(assembleAuctionGear({...input,objective:'forged'}),/invalid_auction_objective/);
await assert.rejects(assembleAuctionGear({...input,objective:'value',checkpoint:maximum.checkpoint}),/auction_search_changed/);
const head=option(3,'HEAD',40000),chest=option(4,'CHEST',40000);
let calls=0;
const synergyInput={...input,options:[cheap,head,chest],selectedSlots:['WRIST','HEAD','CHEST'],objective:'value',maxNewSimulations:2,simulate:async selection=>{
 calls++; const ids=new Set(selection.map(x=>x.id));return measurement(1000+(ids.has('1')?20:0)+(ids.has('3')&&ids.has('4')?80:ids.has('3')||ids.has('4')?-10:0));
}};
let step=await assembleAuctionGear(synergyInput);
for(let i=0;!step.result.exhaustiveComplete;i++){
 assert(i<20,'Value enumeration must converge');
 step=await assembleAuctionGear({...synergyInput,checkpoint:step.checkpoint});
}
assert.equal(step.result.bestConfirmed.spentCopper,80000);
assert.equal(step.result.bestConfirmed.comparison.deltaDps,80,'Full native synergy can beat individual upgrades in value mode');
assert.equal(step.result.comparison.deltaDps,100,'Highest measured DPS stays available independently of selected value set');
assert(calls<=8,'Continuations reuse the same eight distinct effect measurements');
const none=await assembleAuctionGear({...input,objective:'value',simulate:async()=>measurement(1000)});
assert.equal(none.result.bestConfirmed,null,'A zero-cost unchanged baseline must not win the positive-gain ratio or recommend purchases');
console.log('PASS objective: value versus maximum DPS, explicit metadata, legacy checkpoint compatibility, invalid mode, resumed exhaustive synergy, no fake zero-cost improvement.');
