import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import test from "node:test";
import vm from "node:vm";
import * as gear from "../../../lib/wow/gearSimulation.ts";
import {auctionGearMechanicalKey,createAuctionGearMechanicalCache} from "../../../lib/wow/auctionGearMechanicalCache.ts";
import {auctionGearProfileFingerprint} from "../../../lib/wow/auctionGearFingerprint.ts";
import {assertFreshMarket} from "../../../lib/wow/auctionMarket.ts";
import {assembleAuctionGear,searchAuctionGearOptions} from "../../../lib/wow/auctionGearPlanner.ts";

const engine="SimulationCraft native-precision-test";
const rawMean=[20222.49,20300.51],standardError=28.300123456789;
const wires=process.env.GILDRA_NATIVE_PRECISION_REPORT
 ? JSON.parse(readFileSync(process.env.GILDRA_NATIVE_PRECISION_REPORT,"utf8"))
 : rawMean.map(dpsMean=>({dps:Math.round(dpsMean),dpsMean,dpsError:standardError,confidence:95,iterations:750,engine}));
const option={id:"1:WRIST:base",auctionId:1,quantity:1,costCopper:320000,variantKey:"base",candidate:{itemId:1001,name:"Synthetic boundary wrist",slotType:"WRIST",inventoryType:9,itemClassId:4,itemSubclassId:4,eligible:true,compatibility:{specId:72},constraints:{uniqueEquipped:false},variants:[{key:"base",itemLevel:197,bonusIds:[],contextId:0}]}};
function simulator(response){
 const source=readFileSync(new URL("../../../lib/wow/auctionGearRunner.ts",import.meta.url),"utf8");
 const body=stripTypeScriptTypes(source.slice(source.indexOf("function createAuctionSimulator(")),{mode:"strip"});
 let calls=0;
 const create=new vm.Script(body+"\n;createAuctionSimulator").runInNewContext({
  ...gear,auctionGearMechanicalKey,auctionGearMechanicalCache:createAuctionGearMechanicalCache(),auctionGearProfileFingerprint,assertFreshMarket,process,AbortSignal,Number,Error,JSON,
  fetch:async(_url,request)=>{calls++;const selection=JSON.parse(request.body).gearChanges?.length?1:0;
   return {ok:true,headers:{get:()=>"simulationcraft"},json:async()=>response(selection)};}
 });
 const run=create({armory:{equipment:{equipped_items:[]},profile:{id:1},specializations:{},activeTalentLoadout:"explicit-talents"},loadout:[],specId:72,specSlug:"fury-warrior",scenario:"single-target",encounter:{fightLengthSeconds:120,targets:1},market:{sourceUpdatedAt:new Date().toISOString()},engine:()=>wires[0].engine});
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
