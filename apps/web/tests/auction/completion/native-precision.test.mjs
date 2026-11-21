import { createAuctionGearDiagnostics, logAuctionGearDiagnostics } from "../../../lib/wow/auctionGearDiagnostics.ts";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import test from "node:test";
import vm from "node:vm";
import * as gear from "../../../lib/wow/gearSimulation.ts";
import {auctionGearMechanicalKey, purchasedJewelryScoreChanges,createAuctionGearMechanicalCache} from "../../../lib/wow/auctionGearMechanicalCache.ts";
import {applyOwnedAuctionGearChanges} from "../../../lib/wow/auctionGearEnhancedConfiguration.ts";
import {auctionGearProfileFingerprint} from "../../../lib/wow/auctionGearFingerprint.ts";
import {assertFreshMarket} from "../../../lib/wow/auctionMarket.ts";
import {auctionAppliedStatsKey} from "../../../lib/wow/auctionGearEffects.ts";
import {fixedEagleGemEdits} from "../../../lib/wow/auctionRingRatings.ts";
import {ignoresItemContext} from "../../../lib/wow/gearItemModifiers.ts";
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
 const create=new vm.Script(body+"\n;createAuctionSimulator").runInNewContext({ createAuctionGearDiagnostics, fixedEagleGemEdits, ignoresItemContext,
  ...gear,applyOwnedAuctionGearChanges,auctionAppliedStatsKey,auctionGearMechanicalKey, purchasedJewelryScoreChanges,auctionGearMechanicalCache:createAuctionGearMechanicalCache(),auctionGearProfileFingerprint,assertFreshMarket,process,AbortSignal,Number,Error,JSON,
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

test('finalist simulations reuse an equal gem and enchant total on bare rings while receipts retain their identities',async()=>{
 const verifiedEngine='SimulationCraft 1210-01 · 18428cd',signal=new AbortController().signal;
 const equipped=['FINGER_1','FINGER_2'].map((slot,i)=>({slot:{type:slot},item:{id:100+i},item_class:{id:4},
   level:{value:300},inventory_type:{type:'FINGER'},sockets:[{socket_type:{type:'PRISMATIC'}}]}));
 const build=(enchant,secondGem)=>equipped.map((host,i)=>({slotType:host.slot.type,itemId:host.item.id,
   gems:[{index:0,itemId:i?secondGem:154128}],...(!i?{enchantId:enchant}:{})}));
 const source=build(8027,115807),replacement=build(8026,154128),weaker=build(8026,115807);
 async function count(items,level){
   const requests=[];
   const {run,calls}=simulator((_i,request)=>{
     requests.push(request);
     return {...wires[0],iterations:request.precision==='auction-finalist'?750:100,engine:verifiedEngine};
   },{equipped:items,level,verifiedEngine});
   assert.notEqual(run.finalistKey([],source),run.finalistKey([],replacement));
   await run([],signal,source,'finalist');
   const sent=requests[0].armory.equipment.equipped_items;
   assert.equal(sent[0].enchantments[0].enchantment_id,8027);
   assert.equal(sent[1].sockets[0].item.id,115807);
   await run([],signal,replacement,'finalist');
   await run([],signal,weaker,'finalist');
   return calls();
 }
 assert.equal(await count(equipped,90),2);
 assert.equal(await count(equipped,89),3);
 for(const enchantments of [[{enchantment_slot:{id:0},enchantment_id:7967}],[{enchantment_slot:{id:2},enchantment_id:777}]]) {
   const other=structuredClone(equipped);other[1].enchantments=enchantments;
   assert.equal(await count(other,90),3);
 }
});

test('paid legacy ring scrolls with equal total ratings share a finalist fight', () => {
 const engine='SimulationCraft 1210-01 · 18428cd';
 function ring(slot,itemId,enchantId,gemId) {
   const name=slot==='finger1'?'FINGER_1':'FINGER_2';
   const variant={key:'base',itemLevel:49,contextId:13,bonusIds:[],modifiers:[{type:29,value:32}],
     resolution:{engine,metadataVersion:3,nativeNoItemEffects:true,enhancements:{status:'verified'}}};
   return {option:{variantKey:'base',candidate:{itemId,slotType:name,itemClassId:4,itemSubclassId:0,inventoryType:11,
     variants:[variant]},customization:{enchantId,gemIds:[gemId]}},
     change:{slot,itemId,contextId:13,modifiers:variant.modifiers,bonusIds:[],enchantId,gemIds:[gemId]}};
 }
 const make=(a,b)=>[ring('finger1',173131,a,130219),ring('finger2',173132,b,130220)];
 const key=(rings,settings={},request={})=>auctionGearMechanicalKey('same-character',{
   spec:'fury-warrior',scenario:'single-target',targets:1,fightLengthSeconds:120,precision:'finalist',...request
 },{changes:rings.map(x=>x.change),options:rings.map(x=>x.option),playerLevel:90,engine,physicalFinalist:true,...settings});
 const different=make(5326,5326), a=make(5325,5326),b=make(5425,5424);
 assert.equal(key(a),key(b));
 assert.notEqual(key(a),key(different));
 for(const settings of [{physicalFinalist:false},{playerLevel:89},{engine:'unknown'}])assert.notEqual(key(a,settings),key(b,settings));
 assert.notEqual(key(a,{}, {precision:undefined}),key(b,{}, {precision:undefined}));
 for(const alter of [r=>r.change.gemIds=[115804],r=>r.change.bonusIds=[13500],r=>r.change.contextId++,
   r=>r.option.candidate.variants[0].itemLevel=121,r=>r.option.candidate.variants[0].resolution.nativeNoItemEffects=false,
   r=>r.option.customization.enchantId=7967]){
   const changed=structuredClone(b);alter(changed[0]);assert.notEqual(key(a),key(changed));
 }
 assert.notEqual(key(a,{}, {ownedChanges:[{slotType:'FINGER_1',itemId:173131,gems:[]}]}),
                 key(b,{}, {ownedChanges:[{slotType:'FINGER_1',itemId:173131,gems:[]}]}));
 assert.equal(a[0].change.enchantId,5325);
});

test('purchased War Within scrolls share only a verified, unmasked finalist fight', () => {
  const engine = 'SimulationCraft 1210-01 · 18428cd';
  const first = [7329, 7330], swapped = [7330, 7329];
  function ring(index, enchantId) {
    const itemId = [244473, 233483][index];
    const slotType = ['FINGER_1', 'FINGER_2'][index];
    const enhancements = { status: 'verified', socketCount: 0, socketBonusId: 0,
      socketColors: [0, 0, 0], requiredProfessionId: 0 };
    const variant = { key: 'base', contextId: 13, itemLevel: [100, 98][index], bonusIds: [6652], modifiers: [],
      resolution: { engine, metadataVersion: 3, nativeNoItemEffects: true, enhancements } };
    return {
      option: { variantKey: 'base', candidate: { itemId, slotType, itemClassId: 4, itemSubclassId: 0,
        inventoryType: 11, variants: [variant] }, customization: { enchantId } },
      change: { slot: ['finger1', 'finger2'][index], itemId, enchantId, contextId: 13, bonusIds: [6652] },
    };
  }
  function key(ids, { adjust, ownedChanges, removedSlots, physicalFinalist = true, playerLevel = 90 } = {}) {
    const rings = ids.map((id, index) => ring(index, id));
    adjust?.(rings);
    return auctionGearMechanicalKey('same-character', {
      spec: 'fury-warrior', scenario: 'single-target', targets: 1, fightLengthSeconds: 120,
      precision: 'finalist', ownedChanges, removedSlots,
    }, { engine, playerLevel, physicalFinalist, changes: rings.map(r => r.change), options: rings.map(r => r.option) });
  }
  assert.equal(key(first), key(swapped));
  assert.equal(key([7329, 5325]), key([5325, 7329]), 'legacy and War Within scrolls');
  assert.notEqual(key(first), key([7329, 7335]), 'different rating types');

  for (const itemLevel of [70, 170]) {
    const adjust = rings => {
      for (const { option } of rings) {
        const variant = option.candidate.variants[0];
        variant.itemLevel = itemLevel;
        Object.assign(variant.resolution.enhancements, { socketCount: 1, socketColors: [14, 0, 0] });
      }
    };
    assert.equal(key(first, { adjust }), key(swapped, { adjust }), `empty prismatic at item level ${itemLevel}`);
  }
  const rejected = {
    'receipt identity': { physicalFinalist: false },
    'other player level': { playerLevel: 89 },
    'removed ring': { removedSlots: ['FINGER_1'] },
    'owned ring override': { ownedChanges: [{ slotType: 'FINGER_1', itemId: 244473, gems: [] }] },
    'later replacement masks the scroll': { adjust: rings => rings.push(ring(0, 7967)) },
    'different native context': { adjust: ([r]) => r.change.contextId++ },
    'different native bonus list': { adjust: ([r]) => { r.change.bonusIds = [233] } },
    'different selected enchant': { adjust: ([r]) => { r.option.customization.enchantId = 7967 } },
    'socket modified by selection': { adjust: ([r]) => { r.option.customization.gemIds = [130219] } },
    'socket modified by native change': { adjust: ([r]) => { r.change.gemIds = [130219] } },
    'below native minimum': { adjust: ([r]) => { r.option.candidate.variants[0].itemLevel = 69 } },
    'above native maximum': { adjust: ([r]) => { r.option.candidate.variants[0].itemLevel = 171 } },
    'possible item effect': { adjust: ([r]) => { r.option.candidate.variants[0].resolution.nativeNoItemEffects = false } },
  };
  for (const update of [{ socketColors: [1, 0, 0] }, { socketBonusId: 12 }, { requiredProfessionId: 333 }]) {
    const adjust = ([r]) => Object.assign(r.option.candidate.variants[0].resolution.enhancements, update);
    assert.notEqual(key(first, { adjust }), key(swapped, { adjust }), JSON.stringify(update));
  }
  for (const [reason, settings] of Object.entries(rejected)) {
    assert.notEqual(key(first, settings), key(swapped, settings), reason);
  }
});

test("three explicit Midnight gems share a single physical finalist fight and retain separate ranked receipts", async () => {
  const verifiedEngine = "SimulationCraft 1210-01 · 18428cd";
  const signal = new AbortController().signal;
  const slots = ["FINGER_1", "FINGER_2", "NECK"];
  const equipped = slots.map((slot, i) => ({
    slot: { type: slot }, item: { id: 500 + i }, item_class: { id: 4 }, level: { value: 200 },
    inventory_type: { type: slot === "NECK" ? "NECK" : "FINGER" }, sockets: [{ socket_type: { type: "PRISMATIC" } }],
  }));
  const build = ids => ids.map((itemId, i) => ({
    slotType: slots[i], itemId: 500 + i, gems: [{ index: 0, itemId }], ...(i < 2 ? { enchantId: 7966 + i } : {}),
  }));
  const source = build([240887, 240879, 240904]);
  const replacement = build([240871, 240887, 240882]); // Different SKUs and colors on different hosts.
  const requests = [];
  const { run, calls } = simulator((_i, request) => {
    requests.push(request);
    return { ...wires[0], engine: verifiedEngine, iterations: request.precision === "auction-finalist" ? 750 : 100 };
  }, { equipped, level: 90, verifiedEngine });
  assert.notEqual(run.finalistKey([], source), run.finalistKey([], replacement));
  await Promise.all([run([], signal, source, "finalist"), run([], signal, replacement, "finalist")]);
  assert.equal(calls(), 1);
  const sent = requests[0].armory.equipment.equipped_items;
  assert.deepEqual(sent.map(item => item.sockets[0].item.id), [240887, 240879, 240904]);
  assert.deepEqual(sent.slice(0, 2).map(item => item.enchantments[0].enchantment_id), [7966, 7967]);
  await run([], signal, replacement, "finalist");
  assert.equal(calls(), 1);
  await run([], signal, replacement, "certified-candidate");
  assert.equal(calls(), 2);

  const native = { engine: verifiedEngine, playerLevel: 90, changes: [], physicalFinalist: true,
    wornPrismatic: new Map(equipped.map(item => [item.slot.type, item.item.id])) };
  const key = (ownedChanges, settings = {}, request = {}) => auctionGearMechanicalKey("same-character",
    { spec: "fury-warrior", scenario: "single-target", fightLengthSeconds: 120, targets: 1, precision: "finalist", ownedChanges, ...request },
    { ...native, ...settings });
  assert.equal(key(source), key(replacement));
  assert.notEqual(key(source), key(build([240871, 240888, 240882])), "rating changed");
  // Both builds have 23 crit, 22 haste, and both gem colors. Their color multiplicities differ.
  assert.notEqual(key(build([240856, 240873, 240874])), key(build([240857, 240857, 240903])));
  for (const settings of [
    { playerLevel: 89 }, { engine: "unknown" }, { physicalFinalist: false }, { wornPrismatic: new Map() },
    { wornPrismatic: new Map([["NECK", 888], ["FINGER_1", 500], ["FINGER_2", 501]]) },
    { changes: [{ slot: "neck", itemId: 502 }] },
  ]) assert.notEqual(key(source, settings), key(replacement, settings));
  for (const request of [{ precision: undefined }, { removedSlots: ["FINGER_1"] }])
    assert.notEqual(key(source, {}, request), key(replacement, {}, request));
  for (const invalidate of [
    edits => edits.pop(), edits => edits.push(edits[0]), edits => { edits[0].gems[0].index = 1; },
    edits => { edits[0].gems.push({ index: 1, itemId: 240887 }); }, edits => { edits[1].gems = []; },
    edits => { edits[2].enchantId = 5439; }, edits => { edits[2].gems[0].itemId = 240966; },
  ]) {
    const left = structuredClone(source), right = structuredClone(replacement);
    invalidate(left);
    invalidate(right);
    assert.notEqual(key(left), key(right));
  }
  const otherEnchant = structuredClone(replacement);
  otherEnchant[0].enchantId = 7967;
  assert.notEqual(key(source), key(otherEnchant));
  assert.notEqual(key(source), key([...replacement, { slotType: "CHEST", itemId: 600, enchantId: 1984, gems: [] }]));
});

test("mixed and partially replaced prismatic gems share only the physical finalist measurement", async () => {
  const verifiedEngine = "SimulationCraft fixture · 18428cd";
  const slots = ["FINGER_1", "FINGER_2", "NECK"];
  const equipped = slots.map((slot, i) => ({slot: {type: slot}, item: {id: 500 + i},
    item_class: {id: 4}, level: {value: 200}, inventory_type: {type: i === 2 ? "NECK" : "FINGER"},
    sockets: [{socket_type: {type: "PRISMATIC"}}]}));
  const build = (ids, enchants = [7964, 7964]) => ids.map((itemId, i) => ({
    slotType: slots[i], itemId: 500 + i, gems: [{index: 0, itemId}],
    ...(i < 2 ? {enchantId: enchants[i]} : {}),
  }));
  const source = build([240855, 127761]), replacement = build([115804, 240856]);
  const {run, calls} = simulator(() => ({...wires[0], engine: verifiedEngine}), {equipped, level: 90, verifiedEngine});
  assert.notEqual(run.finalistKey([], source), run.finalistKey([], replacement));
  const signal = new AbortController().signal;
  await Promise.all([run([], signal, source, "finalist"), run([], signal, replacement, "finalist")]);
  assert.equal(calls(), 1);

  const native = {engine: verifiedEngine, playerLevel: 90, physicalFinalist: true,
    changes: [], wornPrismatic: new Map(slots.map((s, i) => [s, 500 + i]))};
  const key = (ownedChanges, options = {}, request = {}) => auctionGearMechanicalKey("character",
    {spec: "fury-warrior", scenario: "single-target", fightLengthSeconds: 120, targets: 1,
      precision: "finalist", ownedChanges, ...request}, {...native, ...options});
  // Two 13-mastery gems and a 22-mastery scroll equal two 12s and a 24.
  // The third gem and the three color counts remain part of the native key.
  const three = build([240864, 240864, 240895]);
  const threeCompensated = build([240863, 240863, 240895], [7965, 7964]);
  assert.equal(key(three), key(threeCompensated));
  assert.notEqual(run.finalistKey([], three), run.finalistKey([], threeCompensated));
  await Promise.all([run([], signal, three, "finalist"), run([], signal, threeCompensated, "finalist")]);
  assert.equal(calls(), 2);
  assert.notEqual(key(three), key(build([240864, 240863, 240895], [7965, 7964])));
  assert.notEqual(key(three), key(build([240863, 240863, 240895], [7966, 7964])));
  const withoutScroll = build([240864, 240864, 240895], [7964, undefined]);
  const otherBare = build([240863, 240863, 240895], [undefined, 7965]);
  assert.notEqual(key(withoutScroll), key(otherBare));
  const bare = {barePrismaticRings: new Set(["FINGER_1","FINGER_2"])};
  assert.equal(key(withoutScroll, bare), key(otherBare, bare));
  assert.notEqual(key(three, {physicalFinalist:false}), key(threeCompensated, {physicalFinalist:false}));
  assert.notEqual(key(three, {playerLevel:89}), key(threeCompensated, {playerLevel:89}));
  assert.notEqual(key(three, {engine:"unknown"}), key(threeCompensated, {engine:"unknown"}));
  assert.equal(key(build([240855, 127761, 240863])), key(build([115804, 240863, 240856])));
  assert.equal(key(build([240895, 115804])), key(build([240864, 115804], [7965, 7964])));
  assert.equal(key(build([240855, 127761, 240966])), key(build([115804, 240856, 240966])));
  assert.notEqual(key(build([240855, 127761, 240966])), key(build([115804, 240856, 240967])));
  // Same four ratings, different counts of Peridot and Garnet.
  assert.notEqual(key(build([240855, 240905, 151583])), key(build([240857, 240858, 151580])));
  for (const options of [{physicalFinalist: false}, {playerLevel: 89}, {engine: "unknown"},
    {changes: [{slot: "finger1", itemId: 500}]}, {wornPrismatic: new Map([["FINGER_1", 500]])}]) {
    assert.notEqual(key(source, options), key(replacement, options));
  }
  for (const slot of ["FINGER_1", "finger1"]) {
    assert.notEqual(key(source, {}, {removedSlots: [slot]}), key(replacement, {}, {removedSlots: [slot]}));
  }
  assert.notEqual(key(build([240855, 127761], [9999, 7964])), key(build([115804, 240856], [9999, 7964])));
  assert.notEqual(key(source), key(build([240855, 130220])));
});
