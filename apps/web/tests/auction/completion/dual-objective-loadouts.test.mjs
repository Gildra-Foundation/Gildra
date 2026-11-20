/** Exact planner and presentation contracts with isolated synthetic measurements. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assembleAuctionGear,captureAuctionGearIncumbents} from '../../../lib/wow/auctionGearPlanner.ts';
import {auctionAppliedStatsKey,auctionDominatedArmorOptions} from '../../../lib/wow/auctionGearEffects.ts';
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

test('full assembly shares native armor measurements across receipts and resumed batches', async () => {
 const engine = measurement(1).engine;
 const makeOption = (id, cost, dodge, level = 14) => {
   const row = option(id, 'HEAD', cost);
   if (id <= 2) row.candidate.itemId = 11;
   row.candidate.variants[0].modifiers = [{type: 38, value: id}];
   const stats = Array(46).fill(0);
   stats[39] = dodge;
   Object.assign(row.candidate.variants[0], { itemLevel: level, resolution: { engine, appliedStatsV1: stats,
     nativeNoItemEffects: true, enhancements: { status: 'verified', socketCount: 0, socketBonusId: 0, requiredProfessionId: 0 } } });
   return row;
 };
 const domain = [makeOption(1, 30, 7), makeOption(2, 5, 7), makeOption(3, 4, 8), makeOption(4, 3, 7, 15), makeOption(5, 2, 7)];
 delete domain[4].candidate.variants[0].resolution.appliedStatsV1;
 for (const batch of [1, 25]) {
   const measured = [];
   const h = fixture();
   Object.assign(h.input, { options: domain, selectedSlots: ['HEAD'], reuseAppliedStats: true,
     simulationConcurrency: 2, simulationBatchSize: batch, simulate: async selection => {
       if (selection.length) measured.push(selection[0].auctionId);
       return measurement(!selection.length ? 1000 : selection[0].auctionId <= 2 ? 1500 : 1100);
     } });
   const step = await finish(h, undefined, batch);
   assert.equal(measured.length, 4);
   assert.equal(measured.filter(id => id <= 2).length, 1);
   assert.deepEqual(ids(step.result.bestDpsConfirmed), [2]);
 }
});

test('armor equivalence preserves slot levels, other items, enhancements and incomplete metadata', () => {
 const engine = 'SimulationCraft test';
 const armor = (id, slot, strength) => {
   const row = option(id, slot, 1);
   const values = Array(46).fill(0);
   values[0] = strength;
   Object.assign(row.candidate.variants[0], { resolution: { engine, nativeNoItemEffects: true, appliedStatsV1: values,
     enhancements: { status: 'verified', socketCount: 0, socketBonusId: 0, requiredProfessionId: 0 } } });
   return row;
 };
 const a = [armor(1, 'HEAD', 10), armor(2, 'CHEST', 20)];
 const b = [armor(2, 'CHEST', 20), armor(1, 'HEAD', 10)];
 b[0].candidate.variants[0].modifiers = [{type: 40, value: 123}];
 const key = auctionAppliedStatsKey(a, engine);
 assert.ok(key);
 assert.equal(key, auctionAppliedStatsKey(b, engine));
 for (const alter of [
   row => row.candidate.itemId++,
   row => row.candidate.variants[0].bonusIds = [14447],
   row => row.candidate.variants[0].modifiers = [{type: 9, value: 10}],
   row => row.candidate.variants[0].contextId = 13,
   row => row.candidate.variants[0].itemLevel++,
   row => row.candidate.constraints.setId = 23,
   row => row.candidate.constraints.crafted = true,
   row => row.candidate.variants[0].resolution.nativeNoItemEffects = false,
   row => row.candidate.variants[0].resolution.appliedStatsV1.pop(),
   row => row.candidate.variants[0].resolution.appliedStatsV1[40]++,
   row => row.candidate.variants[0].resolution.enhancements.socketCount++,
   row => row.candidate.variants[0].resolution.engine = 'older engine',
   row => row.customization = { enchantId: 22 },
 ]) {
   const altered = structuredClone(b);
   alter(altered[0]);
   assert.notEqual(key, auctionAppliedStatsKey(altered, engine));
 }
 assert.notEqual(auctionAppliedStatsKey([...a, option(7, 'TRINKET_1', 10)], engine),
   auctionAppliedStatsKey([...b, option(8, 'TRINKET_1', 10)], engine));
});

function plainOffer(id, item, slot, cost, reagent, extra = {}) {
  const row = option(id, slot, cost);
  row.id = 'lot-' + String(id).padStart(2, '0');
  row.candidate.itemId = item;
  row.candidate.variants[0].modifiers = [{type: 38, value: reagent}];
  row.candidate.variants[0].resolution = {engine: measurement(1).engine, nativeNoItemEffects: true,
    appliedStatsV1: Array(46).fill(1), enhancements: {status: 'verified', socketCount: 0, socketBonusId: 0, requiredProfessionId: 0},
    ...extra};
  return row;
}

test('equivalent purchases prune complete continuations with the same winners, including after resuming', async () => {
  const offers = [plainOffer(1, 101, 'BACK', 1, 4), plainOffer(2, 101, 'BACK', 40, 7),
    plainOffer(3, 101, 'BACK', 1, 8), plainOffer(4, 104, 'CHEST', 5, 0), plainOffer(5, 105, 'HEAD', 6, 0),
    plainOffer(6, 106, 'WAIST', 7, 0)];
  const run = async (prune, smallBatch, initial) => {
    const measured = [], h = fixture();
    Object.assign(h.input, {options: offers, selectedSlots: ['BACK','CHEST','HEAD','WAIST'], reuseAppliedStats: prune,
      maxAssignments: smallBatch ? 3 : 100, simulate: async selection => {
        measured.push(selection.map(row => row.auctionId));
        return measurement(1000 + selection.reduce((sum,row) => sum + row.candidate.itemId, 0));
      }});
    return {step: await finish(h, initial, smallBatch ? 2 : 100), measured};
  };
  const control = await run(false, false);
  for (const smallBatch of [false, true]) {
    const {step, measured} = await run(true, smallBatch);
    assert.deepEqual(ids(step.result), ids(control.step.result));
    assert.deepEqual(step.result.bestValueConfirmed, control.step.result.bestValueConfirmed);
    assert.deepEqual(step.result.bestDpsConfirmed, control.step.result.bestDpsConfirmed);
    assert.equal(step.result.combinationCount, '32');
    assert.equal(step.result.validCombinations, 16);
    assert.equal(step.result.proofPrunedAssignments, '16');
    assert.equal(control.step.result.validCombinations, 32);
    assert(measured.every(selection => !selection.includes(2) && !selection.includes(3)));
  }
  const h = fixture();
  const partial = await assembleAuctionGear({...h.input, options: offers, selectedSlots: ['BACK','CHEST','HEAD','WAIST'],
    maxAssignments: 1, simulate: async selection => measurement(1000 + selection.reduce((sum,row) => sum+row.candidate.itemId, 0))});
  const resumed = await run(true, true, structuredClone(partial.checkpoint));
  assert.deepEqual(resumed.step.result.bestDpsConfirmed, control.step.result.bestDpsConfirmed);
});

test('a witness may not reuse a shared lot, conflict with another slot, or use a different spec', () => {
  const engine = measurement(1).engine;
  const cheap = plainOffer(1, 100, 'HEAD', 5, 1), expensive = plainOffer(2, 100, 'HEAD', 10, 2);
  const proof = (others = [], loadout = []) => auctionDominatedArmorOptions([cheap, expensive, ...others], loadout, 72, engine);
  assert.deepEqual([...proof()], [expensive.id]);
  assert.deepEqual([...proof([], [{slotType:'CHEST',itemId:100}])], []);
  assert.deepEqual([...proof([plainOffer(1, 101, 'CHEST', 5, 1)])], []);
  assert.deepEqual([...proof([plainOffer(3, 100, 'CHEST', 5, 1)])], []);
  cheap.candidate.compatibility.specId = 71;
  assert.deepEqual([...proof()], []);
  cheap.candidate.compatibility.specId = 72;
  cheap.costCopper = expensive.costCopper;
  assert.deepEqual([...proof()], [expensive.id]);
  cheap.id = 'A'; expensive.id = 'AB';
  assert.deepEqual([...proof()], []);
});

test('raw bonuses stay ordered and only positively certified scaling inputs may replace 9 and 28', () => {
  const engine = 'SimulationCraft 1210-01 · 18428cd';
  const one = plainOffer(1,101,'BACK',3,1,{engine}), two = structuredClone(one);
  const a = one.candidate.variants[0], b = two.candidate.variants[0];
  a.bonusIds = [2,1]; b.bonusIds = [1,2];
  const key = row => auctionAppliedStatsKey([row],engine);
  assert.notEqual(key(one), key(two));
  b.bonusIds = [...a.bonusIds]; b.contextId = 50;
  assert.equal(key(one),key(two));
  a.modifiers = [{type:28,value:103}]; b.modifiers = [{type:28,value:500}];
  assert.notEqual(key(one),key(two));
  a.resolution.nativeScalingInputsV1 = [0,0,0,0];
  assert.notEqual(key(one),key(two));
  b.resolution.nativeScalingInputsV1 = [0,0,0,0];
  assert.equal(key(one),key(two));
  b.resolution.nativeScalingInputsV1[2] = 1;
  assert.notEqual(key(one),key(two));
});

test('only the same positively certified standalone suffix program substitutes for a raw bonus', () => {
  const engine = 'SimulationCraft 1210-01 · 18428cd', digest = 'a'.repeat(64);
  const first = plainOffer(1,116427,'CHEST',30,1,{engine,nativeScalingInputsV1:[0,0,0,0], nativeSuffixProgramV1:digest});
  const second = structuredClone(first);
  const a = first.candidate.variants[0], b = second.candidate.variants[0];
  a.bonusIds = [47]; b.bonusIds = [68];
  const key = row => auctionAppliedStatsKey([row],engine);
  assert.equal(key(first),key(second));
  for (const change of [
    variant => { variant.resolution.nativeSuffixProgramV1 = 'b'.repeat(64); },
    variant => { variant.bonusIds.push(13708); },
    variant => { variant.bonusIds = [13708]; },
    variant => { delete variant.resolution.nativeScalingInputsV1; },
    variant => { delete variant.resolution.nativeSuffixProgramV1; },
  ]) {
    const different = structuredClone(second);
    change(different.candidate.variants[0]);
    assert.notEqual(key(first),key(different));
  }
});

test('pinned native lot groups keep affordable receipts and resume each cursor in its original domain',async()=>{
 const engine='SimulationCraft fixture · 18428cd';
 const score=dps=>({...measurement(dps),engine,iterations:100});
 const h=fixture(),domain=[option(71,'HEAD',30),option(72,'HEAD',5),option(73,'CHEST',40)];
 for(const row of domain.slice(0,2)){
   row.candidate.itemId=9876;
   row.candidate.variants[0].contextId=row.auctionId;
 }
 Object.assign(h.input,{baseline:score(1000),options:domain,simulate:async sel=>score(1000+sel.length*100)});
 const legacy=await assembleAuctionGear({...h.input,maxAssignments:1});
 const legacyFinish=await finish({input:{...h.input,reuseAppliedStats:true}},legacy.checkpoint);
 const grouped=await assembleAuctionGear({...h.input,reuseAppliedStats:true,maxAssignments:1});
 const resumed=await finish({input:h.input},grouped.checkpoint);
 assert.equal(grouped.checkpoint.nativeLotGroups,1);
 assert.equal(resumed.result.combinationCount,'4');
 assert.equal(legacyFinish.result.combinationCount,'6');
 assert.deepEqual(resumed.result.bestDpsConfirmed,legacyFinish.result.bestDpsConfirmed);
 assert.deepEqual(resumed.result.bestValueConfirmed,legacyFinish.result.bestValueConfirmed);
 assert.deepEqual(ids(resumed.result.bestDpsConfirmed),[72,73]);
 assert.deepEqual(ids(resumed.result.bestValueConfirmed),[72]);
});
