import { createAuctionGearDiagnostics, logAuctionGearDiagnostics } from "../../../lib/wow/auctionGearDiagnostics.ts";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import test from "node:test";
import vm from "node:vm";
import * as gear from "../../../lib/wow/gearSimulation.ts";
import {auctionGearMechanicalKey, purchasedJewelryScoreChanges,createAuctionGearMechanicalCache} from "../../../lib/wow/auctionGearMechanicalCache.ts";
import {auctionGearProfileFingerprint} from "../../../lib/wow/auctionGearFingerprint.ts";
import {assertFreshMarket} from "../../../lib/wow/auctionMarket.ts";
import {auctionAppliedStatsKey} from "../../../lib/wow/auctionGearEffects.ts";
import {assembleAuctionGear,searchAuctionGearOptions} from "../../../lib/wow/auctionGearPlanner.ts";

const engine="SimulationCraft native-precision-test";
const rawMean=[20222.49,20300.51],standardError=28.300123456789;
const wires=process.env.GILDRA_NATIVE_PRECISION_REPORT
 ? JSON.parse(readFileSync(process.env.GILDRA_NATIVE_PRECISION_REPORT,"utf8"))
 : rawMean.map(dpsMean=>({dps:Math.round(dpsMean),dpsMean,dpsError:standardError,confidence:95,iterations:750,engine}));
const option={id:"1:WRIST:base",auctionId:1,quantity:1,costCopper:320000,variantKey:"base",candidate:{itemId:1001,name:"Synthetic boundary wrist",slotType:"WRIST",inventoryType:9,itemClassId:4,itemSubclassId:4,eligible:true,compatibility:{specId:72},constraints:{uniqueEquipped:false},variants:[{key:"base",itemLevel:197,bonusIds:[],contextId:0}]}};
function simulator(response, {equipped=[], level, verifiedEngine=wires[0].engine}={}){
 const source=readFileSync(new URL("../../../lib/wow/auctionGearRunner.ts",import.meta.url),"utf8");
 const body=stripTypeScriptTypes(source.slice(source.indexOf("const runDiagnostics ="), source.indexOf("/** Private, in-process diagnostics")) + source.slice(source.indexOf("function createAuctionSimulator(")),{mode:"strip"});
 let calls=0;
 const create=new vm.Script(body+"\n;createAuctionSimulator").runInNewContext({ createAuctionGearDiagnostics,
  ...gear,auctionAppliedStatsKey,auctionGearMechanicalKey, purchasedJewelryScoreChanges,auctionGearMechanicalCache:createAuctionGearMechanicalCache(),auctionGearProfileFingerprint,assertFreshMarket,process,AbortSignal,Number,Error,JSON,
  fetch:async(_url,request)=>{calls++;const selection=JSON.parse(request.body).gearChanges?.length?1:0;
   return {ok:true,headers:{get:()=>"simulationcraft"},json:async()=>response(selection,JSON.parse(request.body))};}
 });
 const run=create({armory:{equipment:{equipped_items:equipped},profile:{id:1,level},specializations:{},activeTalentLoadout:"explicit-talents"},loadout:[],specId:72,specSlug:"fury-warrior",scenario:"single-target",encounter:{fightLengthSeconds:120,targets:1},market:{sourceUpdatedAt:new Date().toISOString()},engine:()=>verifiedEngine});
 return {run,calls:()=>calls};
}
const input=simulate=>({searchId:"precision-boundary",objective:"value",budgetCopper:320000,options:[option],selectedSlots:["WRIST"],loadout:[],specId:72,market:{sourceUpdatedAt:new Date().toISOString()},signal:new AbortController().signal,simulate});

test("actual native bridge preserves report mean and SE before confidence, value and caches",async()=>{
 const {run,calls}=simulator(i=>wires[i]),signal=new AbortController().signal;
 const baseline=await run([],signal),candidate=await run([option],signal);
 assert.equal(baseline.dps,rawMean[0]);assert.equal(candidate.dps,rawMean[1]);assert.equal(baseline.dpsError,standardError);
 const comparison=gear.compareGearSimulationResults(baseline,candidate);
 assert.equal(comparison.uncertainty.significant,false,"raw delta78.02 is below95% margin78.44; rounded delta79 must never confirm a purchase");
 assert.equal((await searchAuctionGearOptions(input(run))).result.items[0].evaluation,"inconclusive");
 assert.equal((await assembleAuctionGear(input(run))).result.bestConfirmed,null);
 assert.equal(calls(),2,"cached repeated native results must retain full mean/SE without new calls");
});

test("new native bridge rejects an old worker instead of labelling integer measurements precise",async()=>{
 const {run}=simulator(i=>{const {dpsMean,...old}=wires[i];return old;});
 await assert.rejects(run([],new AbortController().signal),/invalid_simulation_result/);
});

test("native precision also preserves a real improvement hidden by integer rounding",()=>{
 const means=[20222.51,20300.49];
 const precise=means.map(dpsMean=>gear.nativeGearSimulationMeasurement({dps:Math.round(dpsMean),dpsMean,dpsError:28,confidence:95,iterations:750,engine}));
 assert.equal(gear.compareGearSimulationResults(...precise).uncertainty.significant,true);
 const rounded=precise.map(result=>({...result,dps:Math.round(result.dps)}));
 assert.equal(gear.compareGearSimulationResults(...rounded).uncertainty.significant,false,"legacy delta77 hides raw delta77.98 above the77.61 margin");
});

test("native bridge rejects inconsistent or non-finite exact measurement fields",async()=>{
 for(const mutate of [w=>({...w,dpsMean:NaN}),w=>({...w,dpsMean:Infinity}),w=>({...w,dpsMean:0}),w=>({...w,dps:w.dps+1}),w=>({...w,dpsError:-1})]){
  const {run}=simulator(i=>mutate(wires[i]));
  await assert.rejects(run([],new AbortController().signal),/invalid_simulation_result/);
 }
});

test("fractional native means determine maximum DPS and whole-set value, never display rounding",async()=>{
 const cheap={...option,id:"2:WRIST:base",auctionId:2,costCopper:100};
 const expensive={...option,id:"3:WRIST:other",auctionId:3,costCopper:200,variantKey:"other",candidate:{...option.candidate,itemId:1002,variants:[{key:"other",itemLevel:197,bonusIds:[]}]}};
 const baseline={dps:20000.49,dpsError:0,confidence:95,iterations:750,engine};
 const result=await assembleAuctionGear({...input(async s=>s.length?{...baseline,dps:s[0].id===cheap.id?20100.1:20100.4}:baseline),options:[cheap,expensive],objective:"dps"});
 assert.equal(result.result.bestConfirmed.purchases[0].auctionId,3,"sub-one-DPS native improvement must win maximum mode");
 const value=await assembleAuctionGear({...input(async s=>s.length?{...baseline,dps:s[0].id===cheap.id?20100.1:20100.4}:baseline),options:[cheap,expensive],objective:"value"});
 assert.equal(value.result.bestConfirmed.purchases[0].auctionId,2,"value denominator retains exact native whole-set gain");
});

test("measurement cache fence changes independently of the maintained APL contract",()=>{
 const request={spec:"fury-warrior",scenario:"single-target",fightLengthSeconds:120,targets:1,gearChanges:[]};
 const legacyMechanical=createHash("sha256").update(JSON.stringify({actionListMode:"native",fightLengthSeconds:120,gearChanges:[],profileFingerprint:"profile",scenario:"single-target",spec:"fury-warrior",targets:1,version:1})).digest("hex");
 assert.notEqual(auctionGearMechanicalKey("profile",request),legacyMechanical,"new precise simulations must bypass old integer cache keys");
 const native={profileFingerprint:"profile",talentLoadout:"talents",scenario:"single-target",duration:120,targets:1,actionListMode:"native"};
 const oldFingerprint=createHash("sha256").update(JSON.stringify({...native,simulationContract:"native-apl-v1"})).digest("hex");
 assert.equal(gear.nativeGearSimulationContract,"native-apl-v1");
 assert.notEqual(gear.gearComparisonFingerprint(native),oldFingerprint,"native single-item caches must fence old rounded measurements");
});

test("finalist precision travels to the worker and never shares a cache entry with an ordinary simulation",async()=>{
 const {run,calls}=simulator((i,request)=>({...wires[i],iterations:({"auction-finalist":750,"auction-candidate":100})[request.precision]}));
 const signal=new AbortController().signal;
 assert.equal((await run([option],signal)).iterations,100);
 assert.equal((await run([option],signal,[],"finalist")).iterations,750);
 assert.equal((await run([option],signal,[],"finalist")).iterations,750);
 assert.equal((await run([option],signal)).iterations,100);
 assert.equal(calls(),2);
});

test('finalist keys share equal explicit worn jewelry ratings while preserving the edited hosts and other equipment', () => {
 const slots=['FINGER_1','FINGER_2','NECK'];
 const equipped=slots.map((slot,i)=>({slot:{type:slot},item:{id:100+i},item_class:{id:4},level:{value:300},
   inventory_type:{type:slot==='NECK'?'NECK':'FINGER'},sockets:[{socket_type:{type:'PRISMATIC'}}]}));
 const build=(enchant1,gem1,enchant2,gem2,neck)=>[gem1,gem2,neck].map((id,i)=>({
   slotType:slots[i],itemId:100+i,gems:[{index:0,itemId:id}],...(i<2?{enchantId:i===0?enchant1:enchant2}:{})
 }));
 const before=build(8020,115804,7994,130220,130216);
 const after=build(7994,130216,8020,130216,130216);
 const keyFor=(options={})=>simulator(null,{equipped,level:90,verifiedEngine:'SimulationCraft fixture · 18428cd',...options}).run.finalistKey;
 const key=keyFor();
 assert.equal(key([],before),key([],after));
 assert.notEqual(key([],before),key([],build(7994,130216,8020,130216,130215)));
 const other={slotType:'CHEST',itemId:829,gems:[],enchantId:7984};
 assert.notEqual(key([],before),key([],[...after,other]));
 for(const change of [edit=>{delete edit.enchantId;},edit=>{edit.enchantId=7967;},
   edit=>{edit.gems=[];},edit=>{edit.gems[0].index=1;},edit=>{edit.itemId++;},
   edit=>{edit.gems[0].itemId=240894;}]) {
   const lhs=structuredClone(before),rhs=structuredClone(after);
   change(lhs[0]);change(rhs[0]);
   assert.notEqual(key([],lhs),key([],rhs));
 }
 for(const override of [{level:89},{verifiedEngine:'SimulationCraft unrecognized'},
   ...[i=>{i.sockets.push(i.sockets[0]);},i=>{i.sockets[0].socket_type.type='RED';},
     i=>{i.inventory_type.type='TRINKET';},i=>{i.level.value=119;},i=>{i.item_class.id=2;}]
     .map(change=>{const items=structuredClone(equipped);change(items[0]);return {equipped:items};}),
   {equipped:[...equipped,equipped[0]]}]) {
   const unverified=keyFor(override);
   assert.notEqual(unverified([],before),unverified([],after));
 }
 const swapNeck=build(7994,115804,8020,130216,130220);
 assert.equal(key([],before),key([],swapNeck));
 const enchantedNeck=structuredClone(equipped);
 enchantedNeck[2].enchantments=[{enchantment_id:5439,enchantment_slot:{id:0}}];
 const uncertain=keyFor({equipped:enchantedNeck});
 assert.notEqual(uncertain([],before),uncertain([],swapNeck));
 assert.deepEqual(before,build(8020,115804,7994,130220,130216));
});
