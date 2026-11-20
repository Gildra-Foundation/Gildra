/** Exact planner and presentation contracts with isolated synthetic measurements. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assembleAuctionGear,captureAuctionGearIncumbents,searchAuctionGearOptions} from '../../../lib/wow/auctionGearPlanner.ts';
import {auctionAppliedStatsKey,auctionDominatedArmorOptions,auctionEffectGroupKey} from '../../../lib/wow/auctionGearEffects.ts';
import {createAuctionGearEnhancedLoadoutIterator} from '../../../lib/wow/auctionGearEnhancedLoadouts.ts';
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
   row => row.candidate.variants[0].resolution.enhancements.socketCount++,
   row => row.candidate.variants[0].resolution.engine = 'older engine',
   row => row.customization = { enchantId: 22 },
 ]) {
   const altered = structuredClone(b);
   alter(altered[0]);
   assert.notEqual(key, auctionAppliedStatsKey(altered, engine));
 }
 // A single point of stamina can change Blood DK combat even when two
 // offers scored identically on Fury. Preserve each native stat independently.
 for (const index of b[0].candidate.variants[0].resolution.appliedStatsV1.keys()) {
   const altered = structuredClone(b);
   altered[0].candidate.variants[0].resolution.appliedStatsV1[index]++;
   assert.notEqual(key, auctionAppliedStatsKey(altered, engine), `native stat ${index}`);
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
    assert.equal(step.result.pruningCounts.substitutionBranches, '2');
    assert.equal(control.step.result.validCombinations, 32);
    assert(measured.every(selection => !selection.includes(2) && !selection.includes(3)));
  }
  const h = fixture();
  const partial = await assembleAuctionGear({...h.input, options: offers, selectedSlots: ['BACK','CHEST','HEAD','WAIST'],
    maxAssignments: 1, simulate: async selection => measurement(1000 + selection.reduce((sum,row) => sum+row.candidate.itemId, 0))});
  const resumed = await run(true, true, structuredClone(partial.checkpoint));
  assert.deepEqual(resumed.step.result.bestDpsConfirmed, control.step.result.bestDpsConfirmed);
});

test('canonical branch counts include only the unvisited suffix and survive resume', async () => {
  const empty = { substitutionBranches: '0', procurementBranches: '0', procurementAssignments: '0',
    equipConflictBranches: '0', equipConflictAssignments: '0' };
  for (const reason of ['procurement', 'equipConflict']) {
    const h = fixture(), slots = ['BACK','CHEST','HEAD','WAIST'];
    h.input.selectedSlots = slots;
    h.input.options = slots.map((slot, i) => option(i + 1, slot, reason === 'procurement' && i < 2 ? 60 : 1));
    if (reason === 'equipConflict') for (const row of h.input.options.slice(0, 2))
      row.candidate.constraints.limitCategoryId = 9;
    const complete = await finish(h, undefined, 100);
    // At 1110, the first two purchases rule out 1110 and 1111. Earlier
    // suffixes 1100 and 1101 are outside this checkpoint's remaining domain.
    const checkpoint = {...structuredClone(complete.checkpoint), cursor: [1,1,1,0], exhausted: false,
      seedSelections: [], nextSeed: 0, pruningCounts: {...empty}};
    const step = await assembleAuctionGear({...h.input,checkpoint,maxAssignments: 1});
    const expected = {...empty, [reason+'Branches']: '1', [reason+'Assignments']: '2'};
    assert.deepEqual(step.result.pruningCounts,expected);
    assert.deepEqual((await finish(h,step.checkpoint)).result.pruningCounts,expected);
    delete checkpoint.pruningCounts;
    assert.equal((await finish(h,checkpoint)).result.pruningCounts,undefined);
    checkpoint.pruningCounts = {...empty, [reason+'Branches']: '3', [reason+'Assignments']: '2'};
    await assert.rejects(() => finish(h,checkpoint),/invalid_search_checkpoint/);
  }
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

test('bare armor can substitute different certified allocations only after the applied ratings match', () => {
  const engine = 'SimulationCraft 1210-01 · 18428cd';
  const chest = (id, suffix) => {
    const row = plainOffer(id,116427,'CHEST',id,0,{engine,nativeScalingInputsV1:[0,0,0,0],nativeSuffixProgramV1:String(id).repeat(64)});
    const v = row.candidate.variants[0];
    v.bonusIds = [suffix];
    v.modifiers = [{type:28,value:1218}];
    return row;
  };
  const a=chest(1,70), b=chest(2,47);
  const prune = (other, bare = true) => [...auctionDominatedArmorOptions([a,other],[],72,engine,bare)];
  assert.deepEqual(prune(b),[b.id]);
  assert.deepEqual(prune(b,false),[]);
  for (const mutate of [
    v => v.resolution.appliedStatsV1[27]++,
    v => v.itemLevel++,
    v => v.bonusIds.push(68),
    v => v.bonusIds = [262],
    v => v.modifiers.push({type:64,value:1}),
    v => v.resolution.nativeScalingInputsV1[2]++,
    v => { delete v.resolution.nativeSuffixProgramV1; },
  ]) {
    const changed = structuredClone(b);
    mutate(changed.candidate.variants[0]);
    assert.deepEqual(prune(changed),[]);
  }
  b.customization = {enchantId:1234};
  assert.deepEqual(prune(b),[]);
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

test('empty-bonus grouping keeps both physical rings and preserves a partially traversed v2 cursor',async()=>{
 const engine='SimulationCraft fixture · 18428cd';
 const h=fixture(),domain=[];
 for(const [lot,cost] of [[91,10],[92,30]]) for(const slot of ['FINGER_1','FINGER_2']){
   const row=option(lot,slot,cost);
   row.id=lot+'-'+slot;
   row.candidate.itemId=30422;
   row.candidate.variants[0].modifiers=[{type:28,value:lot}];
   domain.push(row);
 }
 Object.assign(h.input,{options:domain,selectedSlots:['FINGER_1','FINGER_2'],reuseAppliedStats:true,
   baseline:{...measurement(1000),engine},simulate:async sel=>({...measurement(1000+sel.length*200),engine})});
 const partial=await assembleAuctionGear({...h.input,maxAssignments:1});
 // Versions 1 and 2 use identical groups for these non-crafted rings.
 partial.checkpoint.nativeLotGroups=2;
 h.input.groupCraftedEquipment=true;
 const old=await finish(h,partial.checkpoint);
 const fresh=await finish(h);
 assert.equal(old.result.combinationCount,'9');
 assert.equal(fresh.checkpoint.nativeLotGroups,5);
 assert.equal(fresh.checkpoint.version,4);
 assert.equal(old.checkpoint.version,3);
 assert.equal(fresh.result.combinationCount,'4');
 assert.deepEqual(fresh.result.bestDpsConfirmed,old.result.bestDpsConfirmed);
 assert.deepEqual(fresh.result.bestValueConfirmed,old.result.bestValueConfirmed);
 assert.deepEqual(ids(fresh.result.bestDpsConfirmed),[91,92]);
 assert.equal(fresh.result.bestDpsConfirmed.spentCopper,40);
 assert.deepEqual(ids(fresh.result.bestValueConfirmed),[91]);
});

test('content tuning groups preserve both physical rings, cost ties and the old cursor', async () => {
  const engine = 'SimulationCraft fixture · 18428cd', h = fixture(), options = [];
  for (const [lot, tuning, cost] of [[51, 3321, 10], [52, 5381, 10], [53, 6257, 25]]) {
    for (const slot of ['FINGER_1', 'FINGER_2']) {
      const row = option(lot, slot, cost);
      row.id = lot + '-' + slot;
      row.candidate.inventoryType = 11;
      row.candidate.itemId = 258908;
      Object.assign(row.candidate.variants[0], {bonusIds: [13668, 13900], modifiers: [{type: 9, value: 90}, {type: 28, value: tuning}],
        resolution: {engine, nativeContentTuningV1: [tuning, 90]}});
      options.push(row);
    }
  }
  Object.assign(h.input, {options, selectedSlots: ['FINGER_1', 'FINGER_2'], reuseAppliedStats: true,
    baseline: {...measurement(1000), engine}, simulate: async rows => ({...measurement(1000 + rows.length * 150 + (rows.length ? 50 : 0)), engine})});
  const partial = await assembleAuctionGear({...h.input, maxAssignments: 1});
  // All entries have different type-28 IDs, so v1 and v3 have the same indices.
  Object.assign(partial.checkpoint, {nativeLotGroups: 3, version: 4});
  h.input.groupCraftedEquipment = true;
  const legacy = await finish(h, partial.checkpoint), fresh = await finish(h);
  assert.equal(legacy.result.combinationCount, '16');
  assert.equal(fresh.result.combinationCount, '4');
  for (const field of ['bestDpsConfirmed', 'bestValueConfirmed']) assert.deepEqual(fresh.result[field], legacy.result[field]);
  assert.deepEqual(ids(fresh.result.bestDpsConfirmed), [51, 52]);
  assert.deepEqual(ids(fresh.result.bestValueConfirmed), [51]);
  const key = row => auctionEffectGroupKey(row, engine, true, 'tuning-cap');
  for (const mutate of [
    v => {v.resolution.nativeContentTuningV1[1] = 80;}, v => {v.resolution.nativeContentTuningV1[0] = 1;},
    v => {delete v.resolution.nativeContentTuningV1;}, v => {v.resolution.engine = 'another';},
    v => {v.modifiers[0].value = 89;}, v => {v.bonusIds.reverse();},
  ]) {
    const other = structuredClone(options[2]);
    mutate(other.candidate.variants[0]);
    assert.notEqual(key(options[0]), key(other));
  }
});

test('single-item search reuses verified tuning caps per slot and keeps raw receipts on resume', async () => {
  const engine = 'SimulationCraft fixture · 18428cd';
  const make = (id, slot, tuning, cap, price) => {
    const row = option(id,slot,price);
    row.candidate.itemId = 258908;
    row.candidate.inventoryType = 11;
    Object.assign(row.candidate.variants[0], {bonusIds:[13668,13900], modifiers:[{type:28,value:tuning}],
      resolution:{engine,nativeContentTuningV1:[tuning,cap]}});
    return row;
  };
  const a = make(50,'FINGER_1',3321,90,10), b = make(51,'FINGER_1',5381,90,20);
  const otherSlot = make(52,'FINGER_2',5381,90,15), otherCap = make(53,'FINGER_1',12,80,10);
  const uncertified = make(54,'FINGER_1',891,90,10);
  delete uncertified.candidate.variants[0].resolution.nativeContentTuningV1;
  for (const concurrency of [1,2]) {
    let calls = 0;
    const input = {...fixture().input, selectedSlots:['FINGER_1','FINGER_2'], options:[a,b,otherSlot,otherCap,uncertified],
      groupCraftedEquipment:true, baseline:{...measurement(1000),engine}, simulationConcurrency:concurrency,
      simulate:async () => ({...measurement(1000+100*(++calls)),engine})};
    const first = await searchAuctionGearOptions({...input,maxNewSimulations:1});
    const resumed = await searchAuctionGearOptions({...input,checkpoint:structuredClone(first.checkpoint)});
    assert.equal(calls,4);
    const byLot = new Map(resumed.result.items.map(row=>[row.auctionId,row]));
    assert.deepEqual(byLot.get(50).comparison,byLot.get(51).comparison);
    assert.equal(byLot.get(50).lotCostCopper,10);
    assert.equal(byLot.get(51).lotCostCopper,20);
    assert.equal(new Set(resumed.result.items.map(row=>row.comparison.candidateDps)).size,4);
    assert(resumed.result.searchComplete);
  }
});

test('a context rejected by the worker stays separate from valid native lots',async()=>{
 const engine='SimulationCraft fixture · 18428cd';
 const h=fixture(),domain=[option(71,'HEAD',30),option(72,'HEAD',5)];
 for(const row of domain)row.candidate.itemId=9876;
 domain[1].candidate.variants[0].contextId=10001;
 Object.assign(h.input,{baseline:{...measurement(1000),engine},options:domain,selectedSlots:['HEAD'],reuseAppliedStats:true,
   simulate:async sel=>({...measurement(1000+sel.length*100),engine})});
 assert.equal((await finish(h)).result.combinationCount,'3');
});

test('an independent armor slot extends a shared ring purchase at its exact stack price', async () => {
  const ring = option(31, 'FINGER_1', 50);
  ring.quantity = 2;
  ring.candidate.inventoryType = 11;
  const second = { ...ring, id: '31-finger2', candidate: { ...ring.candidate, slotType: 'FINGER_2' } };
  const head = option(32, 'HEAD', 30), wrist = option(33, 'WRIST', 1);
  wrist.candidate.inventoryType = 9;
  const tried = new Set();
  const h = fixture('dps');
  Object.assign(h.input, {
    options: [ring, second, head, wrist], selectedSlots: ['HEAD', 'FINGER_2', 'WRIST', 'FINGER_1'],
    budgetCopper: 80, baseline: measurement(1000), maxAssignments: 3,
    simulate: async selected => {
      const ids = selected.map(o => o.id);
      tried.add(ids.join('/'));
      return measurement(1000 + selected.length * 100 + Number(ids.includes(head.id)) * 10);
    },
  });
  const step = await finish(h);
  assert.ok(tried.has('31/31-finger2/32'));
  assert.ok(!tried.has('31/31-finger2/32/33'));
  assert.equal(step.result.bestDpsConfirmed.spentCopper, 80);
  assert.deepEqual(ids(step.result.bestDpsConfirmed), [31, 31, 32]);
});

test('equipment finalists resume at 750 iterations and rank both objectives against the refined baseline', async () => {
  const h = fixture();
  const screen = h.input.simulate;
  h.input.simulate = async selected => ({ ...await screen(selected), iterations: 100 });
  const initial = await finish(h);
  const calls = [];
  const precise = async selected => {
    const key = selected.map(o => o.auctionId).sort().join(',');
    calls.push(key);
    return measurement({ '': 1050, '3': 1700, '1': 1040, '2,4': 1660, '1,4': 1850, '2': 1200, '4': 1100 }[key]);
  };
  const paused = await assembleAuctionGear({ ...h.input, checkpoint: initial.checkpoint,
    recheckEquipment: precise, shouldYield: () => calls.length === 1 });
  assert(paused.checkpoint.exhausted);
  assert.equal(paused.result.exhaustiveComplete, false);
  assert.equal(paused.result.searchLimited, true);
  assert.deepEqual(calls, ['']);
  const done = await assembleAuctionGear({ ...h.input, checkpoint: structuredClone(paused.checkpoint), recheckEquipment: precise });
  assert.equal(done.result.exhaustiveComplete, true);
  assert.deepEqual([...calls].sort(), ['', '1', '1,4', '2', '2,4', '3', '4']);
  assert.deepEqual(ids(done.result.bestDpsConfirmed), [1,4]);
  assert.deepEqual(ids(done.result.bestValueConfirmed), [1,4]);
  assert.equal(done.result.comparison.baselineDps, 1050);
  assert.equal(done.result.bestValueConfirmed.comparison.deltaDps, 800);
  assert.equal(done.checkpoint.baseline.iterations, 100);
  assert.deepEqual(done.checkpoint.bestValueConfirmed.optionIds, ['1']);
  const resumed = await assembleAuctionGear({ ...h.input, checkpoint: structuredClone(done.checkpoint),
    recheckEquipment: () => assert.fail('completed finalists must survive a resume') });
  assert.deepEqual(resumed.result, done.result);
});

test('an independent equipment sweep resumes inside the domain under a one-fight budget', async () => {
  const h = fixture(), initial = await finish(h);
  const seen = new Set();
  const precise = async selected => {
    const key = selected.map(row => row.id).sort().join(',');
    assert(!seen.has(key), 'a completed precise fight must survive a restart');
    seen.add(key);
    return measurement(key === '1,4' ? 2000 : key ? 1001 : 1000);
  };
  let state = initial.checkpoint, partial;
  for (let step = 0; step < 30; step++) {
    const previous = seen.size;
    partial = await assembleAuctionGear({ ...h.input, checkpoint: structuredClone(state), recheckEquipment: precise,
      maxNewSimulations: 1, maxAssignments: 3, simulationConcurrency: 2, simulationBatchSize: 4 });
    assert(seen.size - previous <= 1);
    state = partial.checkpoint;
    if (partial.result.exhaustiveComplete) break;
    if (state.equipmentVerification && !state.equipmentVerification.exhausted) {
      const corrupted = structuredClone(state);
      corrupted.equipmentVerification.baseline.iterations = 100;
      await assert.rejects(assembleAuctionGear({ ...h.input, checkpoint: corrupted, recheckEquipment: precise }),
        /invalid_finalist_precision/);
    }
  }
  assert(partial.result.exhaustiveComplete);
  assert.equal(seen.size, 7);
  assert.deepEqual(ids(partial.result.bestDpsConfirmed), [1,4]);
  assert.deepEqual(ids(partial.result.bestValueConfirmed), [1,4]);
  assert.equal(partial.result.simulations - initial.result.simulations, seen.size);
});

test('full equipment screens individual lots and the preview, then covers every affordable set at independent precision', async () => {
  const rows = [option(1,'HEAD',10), option(2,'CHEST',20), option(3,'WAIST',30), option(4,'WRIST',40)];
  const key = rows => rows.map(o=>o.auctionId).sort().join(',');
  const expected = Array.from({length:16}, (_, mask) => key(rows.filter((_, i)=>mask & (1<<i)))).sort();
  const screen = [], verified = [];
  const h = fixture();
  Object.assign(h.input, {options:rows, selectedSlots:rows.map(o=>o.candidate.slotType),
    simulate:async rows=>{screen.push(key(rows)); return {...measurement(1000+rows.length),iterations:100};},
    recheckEquipment:async rows=>{
      const ids = key(rows);
      verified.push(ids);
      return measurement(ids === '1,4' ? 1400 : ids === '1' ? 1120 : 1000+rows.length);
    }});
  const complete = await finish(h, undefined, 2);
  assert.deepEqual(verified.sort(), expected, 'every physical set here has a distinct native input');
  assert.deepEqual(screen.sort(), ['', '1', '1,2,3,4', '2', '3', '4']);
  assert.equal(complete.checkpoint.exhausted,false,'the screening cursor did not certify the full domain');
  assert(complete.checkpoint.equipmentVerification.exhausted);
  assert.equal(complete.result.validCombinations,16);
  assert.equal(complete.result.simulations,verified.length+screen.length);
  assert.deepEqual(ids(complete.result.bestDpsConfirmed),[1,4]);
  assert.deepEqual(ids(complete.result.bestValueConfirmed),[1]);
  const corrupt = structuredClone(complete.checkpoint);
  corrupt.nextEquipmentSingle = rows.length+1;
  await assert.rejects(assembleAuctionGear({...h.input,checkpoint:corrupt}),/invalid_search_checkpoint/);
  const repeated = await assembleAuctionGear({...h.input,checkpoint:complete.checkpoint,
    simulate:()=>assert.fail('screening repeated'),recheckEquipment:()=>assert.fail('verification repeated')});
  assert.deepEqual(repeated.result,complete.result);
});

test('two finalist lanes keep a successful sibling for retry after a failed measurement', async () => {
  const h = fixture(), initial = await finish(h);
  let saved, active = 0, peak = 0;
  const calls = [];
  const input = { ...h.input, simulationConcurrency: 2, checkpoint: initial.checkpoint,
    onCheckpoint: state => { saved = structuredClone(state); } };
  const recheck = async selected => {
    const key = selected.map(o => o.id).sort().join(',');
    calls.push(key);
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    if (!key && calls.length === 2) throw Error('failed baseline');
    return measurement(key ? 1200 : 1000);
  };
  await assert.rejects(assembleAuctionGear({ ...input, recheckEquipment: recheck }), /failed baseline/);
  assert.equal(peak, 2);
  assert.equal(active, 0);
  assert.equal(Object.keys(saved.equipmentFinalistMeasurements).length, 1);
  const sibling = calls[1];
  const done = await assembleAuctionGear({ ...input, checkpoint: saved, recheckEquipment: recheck });
  assert(done.result.exhaustiveComplete);
  assert.equal(calls.filter(key => key === sibling).length, 1);
  assert.equal(calls.filter(key => !key).length, 2);
  assert.equal(peak, 2);
});

test('a short or mismatched final simulation cannot complete the equipment search', async () => {
  const h = fixture(), initial = await finish(h);
  for (const [row, reason] of [[{ ...measurement(1000), iterations: 100 }, /invalid_finalist_precision/],
    [{ ...measurement(1000), engine: 'SimulationCraft other' }, /simulation_version_changed/]]) {
    const checkpoint = structuredClone(initial.checkpoint);
    let saved;
    await assert.rejects(assembleAuctionGear({ ...h.input, checkpoint, recheckEquipment: async () => row, onCheckpoint: state => { saved = state; } }), reason);
    assert.deepEqual(Object.keys(saved.equipmentFinalistMeasurements ?? {}), []);
  }
});

test('certified crafted equipment swaps share a group and retain the cheapest physical lot', async () => {
 const h = fixture(), engine = 'SimulationCraft fixture · 18428cd';
 const first = option(71, 'HEAD', 30), second = option(72, 'HEAD', 5);
 for (const [row, a, b] of [[first, 36, 40], [second, 40, 36]]) {
   row.candidate.itemId = 9876;
   Object.assign(row.candidate.variants[0], { modifiers: [{type:29, value:a}, {type:30, value:b}],
     resolution: { engine, nativeCraftedSymmetryV1:true } });
 }
 Object.assign(h.input, { options:[first, second], selectedSlots:['HEAD'], reuseAppliedStats:true,
   baseline:{...measurement(1000),engine}, simulate:async sel=>({...measurement(sel.length ? 1200 : 1000),engine}) });
 const old = await assembleAuctionGear({...h.input, maxAssignments:1});
 h.input.groupCraftedEquipment = true;
 assert.equal((await finish(h, old.checkpoint)).result.combinationCount,'3');
 const grouped = await finish(h);
 assert.equal(grouped.result.combinationCount,'2');
 assert.deepEqual(ids(grouped.result.bestValueConfirmed),[72]);
 for (const concurrency of [1, 2]) {
   let calls = 0;
   const simulate = async () => { calls++; return {...measurement(1200),engine}; };
   const batch = await searchAuctionGearOptions({...h.input,simulate,simulationConcurrency:concurrency});
   assert.equal(calls, 1);
   assert.equal(batch.result.items.length, 2);
   assert(batch.result.items.every(item => item.comparison.candidateDps === 1200));
 }
 for (const changed of [first, second]) {
   const v = changed.candidate.variants[0]; delete v.resolution.nativeCraftedSymmetryV1;
   assert.equal((await finish(h)).result.combinationCount,'3');
   v.resolution.nativeCraftedSymmetryV1 = true;
 }
 second.customization = {enchantId:123};
 assert.equal((await finish(h)).result.combinationCount,'3');
});

test('bare waist socket substitutes only at equal native inputs and preserves gem opportunities', async () => {
  const engine = 'SimulationCraft 1210-01 · 18428cd';
  const belt = (id, socket) => {
    const row = plainOffer(id, 258942, 'WAIST', id, 0, {engine});
    row.candidate.inventoryType = 6;
    const v = row.candidate.variants[0];
    v.bonusIds = [6652,13663,socket ? 13695 : 13696,13901];
    v.modifiers = [{type:9,value:90},{type:28,value:3321}];
    if (!socket) v.resolution.nativeScalingInputsV1 = [0,0,0,90];
    Object.assign(v.resolution.enhancements, {socketCount:Number(socket), socketColors:[socket ? 14 : 0,0,0]});
    return row;
  };
  const cheaper = belt(1,false), socketed = belt(2,true);
  const proof = (row, bare = true) => [...auctionDominatedArmorOptions([cheaper,row],[],72,engine,bare)];
  assert.deepEqual(proof(socketed),[socketed.id]);
  assert.deepEqual(proof(socketed,false),[]);
  for (const alter of [
    r => r.customization = {gemIds:[240869]},
    r => r.candidate.variants[0].modifiers[0].value--,
    r => r.candidate.variants[0].resolution.appliedStatsV1[2]++,
    r => r.candidate.variants[0].bonusIds[0]++,
    r => r.candidate.variants[0].resolution.enhancements.socketBonusId++,
    r => r.candidate.variants[0].resolution.enhancements.socketColors[0] = 1,
  ]) {
    const changed = structuredClone(socketed);
    alter(changed);
    assert.deepEqual(proof(changed),[]);
  }
  const shoulder = option(3,'SHOULDER',5);
  const simulate = async rows => ({...measurement(1000 + (rows.some(o=>o.candidate.slotType==='WAIST') ? 100 : 0)
    + (rows.includes(shoulder) ? 50 : 0)),engine});
  const run = async reuseAppliedStats => {
    const h=fixture();
    Object.assign(h.input,{options:[cheaper,socketed,shoulder],selectedSlots:['WAIST','SHOULDER'],
      simulate,recheckEquipment:simulate,bareEquipmentProofs:true,reuseAppliedStats});
    return (await finish(h)).result;
  };
  const reference = await run(false), reduced = await run(true);
  assert.equal(reduced.proofPrunedAssignments,'2');
  assert.deepEqual(ids(reduced.bestDpsConfirmed),[1,3]);
  assert.deepEqual(ids(reduced.bestValueConfirmed),[1]);
  assert.deepEqual(reduced.bestDpsConfirmed,reference.bestDpsConfirmed);
  assert.deepEqual(reduced.bestValueConfirmed,reference.bestValueConfirmed);

  const enhanced = createAuctionGearEnhancedLoadoutIterator({engine, specId:72, options:[cheaper,socketed,shoulder],
    equipment:{equipped_items:[]}, loadout:[], selectedSlots:['WAIST','SHOULDER'], budgetCopper:100});
  const batch = await enhanced.nextBatch(enhanced.initialState(), {maxAssignments:20,maxResults:20,signal:new AbortController().signal});
  assert.equal(batch.complete,true);
  const withSocket = batch.loadouts.filter(row => row.options.includes(socketed));
  assert.deepEqual(withSocket.map(row => row.options.map(o=>o.auctionId).sort().join(',')).sort(), ['2','2,3']);
  assert(withSocket.every(row => row.remainingCopper === 100-row.options.reduce((sum,o)=>sum+o.costCopper,0)));
});

test('bare assembly keeps an old tuning-cap cursor when a later worker supplies the drop curve', async () => {
  const engine = 'SimulationCraft fixture · 18428cd', h = fixture(), options = [];
  for (const slot of ['FINGER_1', 'FINGER_2']) {
    for (const [lot, drop, cost] of [[51, 81, 10], [52, 82, 11], [53, 83, 19]]) {
      const row = option(lot, slot, cost);
      row.id = lot + '-' + slot;
      row.candidate.itemId = 258910;
      row.candidate.inventoryType = 11;
      Object.assign(row.candidate.variants[0], {bonusIds: [13668, 13900], itemLevel: 133,
        modifiers: [{type: 9, value: drop}], resolution: {engine}});
      options.push(row);
    }
  }
  Object.assign(h.input, {options, selectedSlots: ['FINGER_1','FINGER_2'], reuseAppliedStats: true,
    groupCraftedEquipment: true, baseline: {...measurement(1000), engine},
    simulate: async rows => ({...measurement(1000 + rows.length * 150 + (rows.length ? 50 : 0)), engine})});
  const partial = await assembleAuctionGear({...h.input, maxAssignments: 1});
  partial.checkpoint.nativeLotGroups = 4;
  for (const row of options) {
    const variant = row.candidate.variants[0];
    variant.resolution.nativeDropCurveV1 = [variant.modifiers[0].value, 0, 133];
  }
  const legacy = await finish(h, partial.checkpoint), current = await finish(h);
  assert.equal(legacy.result.combinationCount, '16');
  assert.equal(current.result.combinationCount, '4');
  assert.deepEqual(ids(current.result.bestDpsConfirmed), [51, 52]);
  assert.deepEqual(current.result.bestValueConfirmed, legacy.result.bestValueConfirmed);
  assert.deepEqual(current.result.bestDpsConfirmed, legacy.result.bestDpsConfirmed);
});
