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
function score(o, precision, change = {}) {
  const v = o.candidate.variants[0];
  const c = { slot: o.candidate.slotType.toLowerCase(), itemId: o.candidate.itemId, contextId: v.contextId,
    bonusIds: v.bonusIds, modifiers: v.modifiers, ...change };
  return auctionGearMechanicalKey('profile', { spec:'fury', scenario:'single', fightLengthSeconds:120, targets:1, precision },
    { engine, changes:[c], options:[o], physicalFinalist: precision === 'finalist' });
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
  assert.equal(fresh.checkpoint.nativeLotGroups,10);
  assert.equal(fresh.result.combinationCount,'4');
  assert.deepEqual(fresh.result.bestDpsConfirmed,resumed.result.bestDpsConfirmed);
  assert.deepEqual(fresh.result.bestValueConfirmed,resumed.result.bestValueConfirmed);
});
