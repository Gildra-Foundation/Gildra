import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { searchAuctionGearOptions } from '../../../lib/wow/auctionGearPlanner.ts';
import { createAuctionGearDiagnostics } from '../../../lib/wow/auctionGearDiagnostics.ts';
const source=readFileSync(new URL('../../../lib/wow/auctionGearRunner.ts',import.meta.url),'utf8');
const part=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const code=stripTypeScriptTypes(part('function publicAuctionResult(', 'function retainAuctionIncumbents(')+part('async function updateAuctionSearchResult(', 'export async function startAuctionGearSearch('))+';updateAuctionSearchResult';
const measurement=dps=>({dps,dpsError:1,confidence:95,iterations:750,engine:'SimulationCraft capacity-budget'});
function fixture(){
 let capacity=2,probes=0,native=0,active=0,peak=0;
 const simulate=Object.assign(async options=>{native++;active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;return measurement(1100+options[0].candidate.itemId);},{concurrency:async signal=>{signal.throwIfAborted();probes++;return capacity;}});
 const options=Array.from({length:4},(_,i)=>({id:`option-${i}`,auctionId:i+1,quantity:1,costCopper:10,variantKey:'exact',candidate:{itemId:100+i,name:'Fixture',slotType:'WRIST',inventoryType:9,itemClassId:4,itemSubclassId:4,eligible:true,constraints:{},compatibility:{specId:72},variants:[{key:'exact',itemLevel:300,bonusIds:[i+1]}]}}));
 const entry={id:'capacity-probe-fixture',retainedBaseline:measurement(1000),context:{input:{budgetCopper:1000,selectedSlots:['WRIST'],objective:'value',scenario:'single-target'},options,loadout:[],specId:72,market:{sourceUpdatedAt:new Date().toISOString()},currentBySlot:new Map(),coverage:{},simulate}};
 const metrics=createAuctionGearDiagnostics();
 const update=vm.runInNewContext(code,{searchAuctionGearOptions,metricsFor:()=>metrics,scheduleAuctionGearSearchSave:()=>{},Map,Set,Number,Object,JSON});
 return {entry,update,get stats(){return{probes,native,peak};},set capacity(value){capacity=value;peak=0;}};
}
test('one-comparison updates skip health and preserve native measurement precision',async()=>{
 const h=fixture();const result=await h.update(h.entry,new AbortController().signal,()=>{},()=>false,1);
 assert.deepEqual(h.stats,{probes:0,native:1,peak:1});assert.equal(result.simulations,1);assert.equal(result.items.filter(row=>row.comparison).length,1);
 assert.equal(h.entry.searchCheckpoint.baseline.iterations,750);assert.equal(h.entry.searchCheckpoint.baseline.confidence,95);
});
test('render-only updates skip health/native work and latch an already-yielded predicate',async()=>{
 const h=fixture();let predicates=0;
 await h.update(h.entry,new AbortController().signal,()=>{},()=>++predicates===1);
 assert.deepEqual(h.stats,{probes:0,native:0,peak:0});assert.equal(predicates,1);assert.equal(h.entry.searchCheckpoint.nextOption,0);
});
test('real candidate pairs always recheck live capacity including a same-checkpoint downgrade',async()=>{
 const h=fixture();await h.update(h.entry,new AbortController().signal,()=>{},()=>false,2);
 assert.deepEqual(h.stats,{probes:1,native:2,peak:2});h.capacity=1;
 const result=await h.update(h.entry,new AbortController().signal,()=>{},()=>false,2);
 assert.deepEqual(h.stats,{probes:2,native:4,peak:1});assert.equal(result.searchComplete,true);
});
test('pre-cancellation starts neither health nor simulation for any budget',async()=>{
 for(const max of[1,2,undefined]){const h=fixture(),controller=new AbortController();controller.abort();await assert.rejects(h.update(h.entry,controller.signal,()=>{},()=>true,max),{name:'AbortError'});assert.deepEqual(h.stats,{probes:0,native:0,peak:0});}
});
