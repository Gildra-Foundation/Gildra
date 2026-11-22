import assert from 'node:assert/strict';
import test from 'node:test';
import { auctionEffectGroupKey, auctionEffectGroups, cheapestAuctionEffectSelection } from '../../../lib/wow/auctionGearEffects.ts';
import { assembleAuctionGear } from '../../../lib/wow/auctionGearPlanner.ts';
import { auctionGearMechanicalKey } from '../../../lib/wow/auctionGearMechanicalCache.ts';

const engine = 'SimulationCraft 1210-01 · 18428cd';
const slots = ['MAIN_HAND', 'OFF_HAND'];
function offer(lot, slot, price, bonus = 13729) {
  const variantKey = 'variant-' + lot;
  const drop = bonus === 13729 ? 80 : 81, tuning = 3085;
  return {
    id: [lot, slot, variantKey].join(':'), auctionId: lot, costCopper: price, quantity: 1, variantKey,
    candidate: { itemId: 258946, slotType: slot, inventoryType: 13, itemClassId: 2, itemSubclassId: 7, eligible: true,
      constraints: { uniqueEquipped: false, crafted: false, requiredLevel: 90 }, compatibility: { specId: 72 },
      variants: [{ key: variantKey, contextId: 1, itemLevel: 133, modifiers: [{type: 9, value: drop}, {type: 28, value: tuning}], bonusIds: [bonus],
        resolution: { metadataVersion: 3, engine, nativeWeaponCurveV1: [drop, tuning, 133], nativeNoItemEffects: true,
          appliedStatsV1: Array(46).fill(0), weapon: { minDamage: 27, maxDamage: 58, dps: 16.34, speedSeconds: 2.6 },
          enhancements: { status: 'verified', socketCount: 0, socketColors: [0,0,0], socketBonusId: 0, requiredProfessionId: 0 } } }] },
  };
}
const groupKey = (o, current = true) => auctionEffectGroupKey(o, engine, 'missive', 'drop-curve', 'jewelry-suffix', current);
function score(o, precision, change = {}, physicalFinalist = precision === 'finalist') {
  const v = o.candidate.variants[0];
  const c = { slot: o.candidate.slotType.toLowerCase(), itemId: o.candidate.itemId, contextId: v.contextId,
    bonusIds: v.bonusIds, modifiers: v.modifiers, ...change };
  return auctionGearMechanicalKey('profile', { spec:'fury', scenario:'single', fightLengthSeconds:120, targets:1, precision },
    { engine, changes:[c], options:[o], physicalFinalist });
}

test('equal native curves preserve joint stock, total price and physical tie order', async () => {
  const signal = new AbortController().signal;
  for (const copies of [1,2]) for (const secondPrice of [7,9]) {
    const options = slots.flatMap(slot => {
      const a = offer(11,slot,7), b = offer(12,slot,secondPrice,13900);
      a.quantity = copies;
      return [b,a];
    });
    const before = auctionEffectGroups(options,slots,o=>groupKey(o,false));
    const after = auctionEffectGroups(options,slots,o=>groupKey(o));
    assert.deepEqual(before.map(x=>x.length),[2,2]);
    assert.deepEqual(after.map(x=>x.length),[1,1]);
    const price = copies === 2 ? 7 : 7 + secondPrice;
    assert.equal(await cheapestAuctionEffectSelection(after.flat(),price-1,signal),null);
    const receipt = await cheapestAuctionEffectSelection(after.flat(),price,signal);
    assert.equal(receipt.costCopper,price);
    assert.deepEqual(receipt.options.map(o=>o.auctionId),copies===2?[11,11]:[11,12]);
  }
});

test('weapon certificates bind full native state, slot and actual unenhanced changes at both precisions', () => {
  const a = offer(11,slots[0],7), b = offer(12,slots[0],9,13900);
  assert.notEqual(groupKey(a,false),groupKey(b,false));
  for (const precision of [undefined,'finalist']) {
    assert.equal(score(a,precision),score(b,precision));
    assert.notEqual(score(a,precision,{enchantId:6700}),score(b,precision,{enchantId:6700}));
    assert.notEqual(score(a,precision,{modifiers:[]}),score(b,precision));
  }
  assert.notEqual(score(a),score(a,'finalist'));
  for (const mutate of [
    (c,v,r)=>c.itemId++, (c,v,r)=>c.slotType='OFF_HAND', (c,v,r)=>c.itemSubclassId++,
    (c,v,r)=>c.constraints.crafted=true, (c,v,r)=>v.bonusIds=[6652,13730],
    (c,v,r)=>v.bonusIds=[13729,43], (c,v,r)=>r.nativeWeaponCurveV1[0]++,
    (c,v,r)=>delete r.nativeWeaponCurveV1, (c,v,r)=>r.nativeNoItemEffects=false,
    (c,v,r)=>r.appliedStatsV1[3]++, (c,v,r)=>r.weapon.minDamage++,
    (c,v,r)=>r.weapon.speedSeconds++, (c,v,r)=>r.enhancements.socketColors[0]=14,
  ]) {
    const changed=structuredClone(b), c=changed.candidate, v=c.variants[0];
    mutate(c,v,v.resolution);assert.notEqual(groupKey(a),groupKey(changed));assert.notEqual(score(a,'finalist'),score(changed,'finalist'));
  }
});

test('a saved version-nine weapon traversal resumes its original groups', async () => {
  const options = slots.flatMap(slot => [offer(11,slot,7),offer(12,slot,9,13900)]);
  const baseline = { engine, iterations:750, dpsError:0, confidence:95, dps:1000 };
  const input = {
    searchId:'weapon-recovery', options, selectedSlots:slots, objective:'value', specId:72, loadout:[], budgetCopper:16,
    market:{sourceUpdatedAt:new Date().toISOString()}, baseline, signal:new AbortController().signal,
    reuseAppliedStats:true, groupCraftedEquipment:true, maxAssignments:1,
    simulate:async selected=>({...baseline,dps:1000+selected.length*20}),
  };
  // For these weapon-only inputs versions six through nine have the identical
  // effect-group order. Capture a real partly consumed cursor in that order.
  const { checkpoint } = await assembleAuctionGear(input);
  assert.equal(checkpoint.nativeLotGroups,6);
  checkpoint.nativeLotGroups = 9;
  const finish = async saved => {
    for (let step=0;step<32;step++) {
      const r=await assembleAuctionGear({...input,bareEquipmentProofs:true, checkpoint:saved});
      if(r.result.exhaustiveComplete)return r;
      saved=r.checkpoint;
    }
    assert.fail('weapon traversal did not finish');
  };
  const resumed=await finish(checkpoint), fresh=await finish(undefined);
  assert.equal(resumed.checkpoint.nativeLotGroups,9);
  assert.equal(resumed.result.combinationCount,'9');
  assert.equal(fresh.checkpoint.nativeLotGroups,14);
  assert.equal(fresh.result.combinationCount,'4');
  assert.deepEqual(fresh.result.bestDpsConfirmed,resumed.result.bestDpsConfirmed);
  assert.deepEqual(fresh.result.bestValueConfirmed,resumed.result.bestValueConfirmed);
});

function durabilityOffer(lot, slot, marker, price) {
  const o = offer(lot, slot, price);
  const variant = o.candidate.variants[0];
  variant.bonusIds = [marker, 12769];
  variant.modifiers = [{type: 28, value: 3321}];
  delete variant.resolution.nativeWeaponCurveV1;
  variant.resolution.nativeContentTuningV1 = [3321, 90];
  return o;
}
const durabilityGroup = o => auctionEffectGroupKey(o, engine, "missive", "drop-curve", "jewelry-suffix", true, "curves-and-missives", true);

test("indestructibility reuses the same native fight, preserving tuning caps and original finalist ranks", () => {
  const a = durabilityOffer(11,slots[0],43,7), b = durabilityOffer(12,slots[0],6652,9);
  const variant = b.candidate.variants[0];
  variant.modifiers[0].value = 5381;
  variant.resolution.nativeContentTuningV1 = [5381, 90];
  assert.equal(durabilityGroup(a), durabilityGroup(b));
  for (const edit of [{}, {enchantId: 1900}]) {
    assert.equal(score(a, "finalist", edit), score(b, "finalist", edit));
    assert.equal(score(a, undefined, edit), score(b, undefined, edit));
  }
  assert.notEqual(score(a, "finalist", {}, false), score(b, "finalist", {}, false));
  assert.notEqual(score(a, "finalist", {enchantId: 1900}), score(b, "finalist"));
  for (const mutate of [
    (o,v)=>{v.bonusIds[0]=40;}, (o,v)=>{v.bonusIds.reverse();}, (o,v)=>{v.bonusIds[1]=13730;},
    (o,v)=>{v.resolution.nativeContentTuningV1[1]--;}, (o,v)=>{v.modifiers.push({type:9,value:80});},
    (o,v)=>{v.resolution.weapon.maxDamage++;}, (o,v)=>{v.resolution.weapon.speedSeconds=0;},
    (o,v)=>{v.resolution.appliedStatsV1[2]++;}, (o,v)=>{v.resolution.engine="unknown";},
    (o,v)=>{v.resolution.nativeNoItemEffects=false;}, (o,v)=>{v.resolution.enhancements.socketCount=1;},
    (o,v)=>{o.candidate.itemId++;}, (o,v)=>{o.candidate.slotType="OFF_HAND";}, (o,v)=>{v.resolution.metadataVersion=2;},
  ]) {
    const changed = structuredClone(b);
    mutate(changed, changed.candidate.variants[0]);
    assert.notEqual(durabilityGroup(a),durabilityGroup(changed));
    assert.notEqual(score(a,"finalist"),score(changed,"finalist"));
  }
  const incorrectChange = {modifiers: [{type:28,value:1}]};
  assert.notEqual(score(a,"finalist",incorrectChange),score(b,"finalist",incorrectChange));
});

test("only fresh stable receipts collapse indestructible weapons, retaining exact two-hand purchases", async () => {
  const baseline = {engine, iterations:100, dpsError:0, confidence:95, dps:1000};
  for (const quantity of [1,2]) for (const budgetCopper of [7,15]) {
    const options = slots.flatMap(slot => {
      const a=durabilityOffer(11,slot,43,7), b=durabilityOffer(12,slot,6652,8);
      a.quantity=quantity;
      return [a,b];
    });
    const input = {searchId:"durability",options,selectedSlots:slots,objective:"dps",specId:72,loadout:[],
      budgetCopper,market:{sourceUpdatedAt:new Date().toISOString()},baseline,signal:new AbortController().signal,
      reuseAppliedStats:true,groupCraftedEquipment:true,bareEquipmentProofs:true,preciseSingleCards:true,
      simulate:async selected=>({...baseline,dps:1000+selected.length*50}),
      recheckEquipment:async selected=>({...baseline,iterations:750,dps:1000+selected.length*60})};
    const partial = await assembleAuctionGear({...input,screeningGroupVersion:13,maxAssignments:1});
    const prev = await assembleAuctionGear({...input,checkpoint:partial.checkpoint});
    const fresh = await assembleAuctionGear(input);
    for(const [run,version] of [[prev,13],[fresh,14]]){
      assert.equal(run.checkpoint.nativeLotGroups,version);
      assert.equal(run.checkpoint.equipmentVerification.nativeLotGroups,version);
      assert.equal(run.result.exhaustiveComplete,true);
    }
    for(const objective of ["bestDpsConfirmed","bestValueConfirmed"]){
      assert.deepEqual(fresh.result[objective],prev.result[objective]);
      assert.ok(fresh.result[objective]);
    }
    assert.deepEqual(fresh.preciseSingles.byOption,prev.preciseSingles.byOption);
    assert.equal(fresh.result.combinationCount,"4");
    assert.equal(prev.result.combinationCount,budgetCopper===15?"9":"4");
  }
});
