import assert from 'node:assert/strict';
import test from 'node:test';
import { auctionEffectGroupKey } from '../../../lib/wow/auctionGearEffects.ts';
import { auctionRingMirrorOrder } from '../../../lib/wow/auctionGearRingMirrors.ts';
import { assembleAuctionGear } from '../../../lib/wow/auctionGearPlanner.ts';

const engine = 'SimulationCraft test · 18428cd';
const slots = ['FINGER_1','FINGER_2','WAIST'];
function offer(lot, itemId, slot, price, variantKey = String(itemId)) {
  const stats = Array(46).fill(0);
  stats[29] = 8;
  const ring = slot.startsWith('FINGER');
  return {id:`${lot}:${slot}:${variantKey}`, auctionId:lot, quantity:1, costCopper:price, variantKey,
    candidate:{itemId, slotType:slot, inventoryType:ring ? 11 : 6, itemClassId:4, itemSubclassId:ring ? 0 : 4, eligible:true,
      name:'fixture', constraints:{uniqueEquipped:false,crafted:false,requiredLevel:1}, compatibility:{specId:72},
      variants:[{key:variantKey,itemLevel:80,bonusIds:[],modifiers:[],resolution:{engine,metadataVersion:3,nativeNoItemEffects:true,
        appliedStatsV1:stats,enhancements:{status:'verified',socketCount:0,socketColors:[0,0,0],socketBonusId:0,requiredProfessionId:0}}}]}};
}
function groupFixture() {
  const group = (...options) => ({options});
  return slots.map(slot => slot === 'WAIST' ? [group(offer(5,40,slot,7))] :
    [group(offer(1,31,slot,2),offer(4,31,slot,3)),group(offer(10,32,slot,2)),group(offer(2,33,slot,1))]);
}
test('bare Fury ring mirror preserves receipt order even when lot numbers are prefixes',()=>{
  const groups=groupFixture(), order=auctionRingMirrorOrder(groups,slots,engine,72);
  // "10:" sorts before "1:". The first physical receipt that differs wins the tie.
  assert(order.skips([1,2,0]));
  assert(!order.skips([2,1,0]));
  assert(order.skipsReceipt([groups[0][0].options[0],groups[1][1].options[0],groups[2][0].options[0]]));
  for (const axis of groups.slice(0,2)) {
    axis[0].options[1].costCopper=2;
    axis[0].options.reverse();
  }
  assert(auctionRingMirrorOrder(groups,slots,engine,72).skips([1,2,0]));
  for (const cursor of [[0,2,1],[1,0,1],[2,2,0]]) assert(!order.skips(cursor));
});
test('mirrors require two interchangeable native inputs and two independent purchasable lots',()=>{
  const deny=(mutate)=>{
    const groups=groupFixture();
    mutate(groups);
    assert(!auctionRingMirrorOrder(groups,slots,engine,72)?.skips([1,2,1]));
  };
  for (const mutate of [
    o=>o.customization={enchantId:7964},o=>o.candidate.inventoryType=12,o=>o.candidate.constraints.setId=12,
    o=>o.candidate.variants[0].resolution.nativeNoItemEffects=false,o=>o.candidate.variants[0].resolution.enhancements.socketColors=[14,0,0],
    o=>o.candidate.variants[0].resolution.appliedStatsV1.pop(),o=>o.candidate.variants[0].resolution.engine='different',
    o=>o.candidate.constraints.limitCategoryId=5,o=>o.candidate.variants[0].bonusIds=[1234],o=>o.quantity=2,o=>o.costCopper=25,
  ]) deny(gs=>mutate(gs[1][0].options[0]));
  deny(gs=>gs[2][0].options.push(offer(4,31,'WAIST',3)));
  deny(gs=>gs[0][2].options.push(offer(4,31,'FINGER_1',3)));
  deny(gs=>gs[1][0].options.pop());
  deny(gs=>gs[0][0].options[1].costCopper=2);
  assert.equal(auctionRingMirrorOrder(groupFixture(),slots,engine,63),undefined);
  assert.equal(auctionRingMirrorOrder(groupFixture(),slots,'different',72),undefined);
});
test('bare rings with matching empty prismatic sockets can move between fingers',()=>{
  const groups=groupFixture();
  const copies=groups.slice(0,2).flatMap(axis=>axis[0].options);
  for(const o of copies) Object.assign(o.candidate.variants[0].resolution.enhancements,{socketColors:[14,0,0],socketCount:1});
  const skips=()=>auctionRingMirrorOrder(groups,slots,engine,72)?.skips([1,2,1])??false;
  assert(skips());
  const o=copies[0], sockets=o.candidate.variants[0].resolution.enhancements;
  for(const change of [
    {socketColors:[0,14,0]}, {socketColors:[2,0,0]}, {socketCount:0}, {socketBonusId:5203}, {requiredProfessionId:755},
  ]) {
    const original={...sockets};
    Object.assign(sockets,change);
    assert(!skips());
    Object.assign(sockets,original);
  }
  for(const copy of copies) copy.candidate.variants[0].resolution.enhancements.socketBonusId=5203;
  assert(skips());
  for(const copy of copies) copy.candidate.variants[0].resolution.enhancements.socketBonusId=999999;
  assert(!skips());
  for(const copy of copies) {
    copy.candidate.variants[0].resolution.enhancements.socketBonusId=5203;
    copy.customization={gemIds:[192982]};
  }
  assert(!skips());
});
test('full bare search skips equivalent ring branches and preserves both physical winners across restores',async()=>{
  const options=groupFixture().flat(2).flatMap(g=>g.options);
  const run=async proof=>{
    const calls=[];
    const input={searchId:'ring-branches',options,selectedSlots:slots,objective:'value',specId:72,loadout:[],budgetCopper:12,
      market:{sourceUpdatedAt:new Date().toISOString()},signal:new AbortController().signal,reuseAppliedStats:true,groupCraftedEquipment:true,
      bareEquipmentProofs:proof,maxNewSimulations:5,maxAssignments:13,
      simulate:async selection=>{
        calls.push(selection.map(o=>o.id).sort());
        const ids=selection.map(o=>o.candidate.itemId);
        const dps=1000+ids.reduce((n,id)=>n+({31:25,32:50,33:30,40:20}[id]),0)+(ids.includes(31)&&ids.includes(32)?100:0);
        return {engine,dps,dpsError:0,iterations:750,confidence:95};
      }};
    let checkpoint;
    for(let i=0;i<200;i++){
      const result=await assembleAuctionGear({...input,checkpoint});
      checkpoint=structuredClone(result.checkpoint);
      if(result.result.exhaustiveComplete)return {result:result.result,calls};
    }
    assert.fail('market did not complete');
  };
  const control=await run(false),candidate=await run(true);
  for(const key of ['bestValueConfirmed','bestDpsConfirmed']) {
    assert(candidate.result[key]?.purchases.length);
    assert.deepEqual(candidate.result[key],control.result[key]);
  }
  assert(candidate.calls.length<control.calls.length);
  assert(BigInt(candidate.result.pruningCounts.substitutionBranches)>0n);
});

function suffixOffer(lot, slot, price, bonus) {
  const o = offer(lot, 21768, slot, price, String(bonus));
  const v = o.candidate.variants[0];
  Object.assign(v, {itemLevel:13, bonusIds:[bonus], modifiers:[{type:28,value:1418}]});
  v.resolution.nativeScalingInputsV1 = [0,0,0,0];
  return o;
}

test('bare ring suffix grouping requires identical certified native inputs and equip constraints', () => {
  const a = suffixOffer(101, slots[0], 10, 1679);
  const b = suffixOffer(102, slots[0], 20, 1680);
  const key = (o, bare = true, build = engine) => auctionEffectGroupKey(o, build, "missive", "drop-curve", bare);
  assert.equal(key(a), key(b));
  assert.notEqual(key(a, false), key(b, false));
  assert.notEqual(key(a, true, 'other'), key(b, true, 'other'));
  for (const change of [
    o => o.customization = {enchantId:123}, o => o.candidate.itemId++,
    o => o.candidate.constraints.uniqueEquipped = true, o => o.candidate.slotType = slots[1],
    (_, v) => v.itemLevel++, (_, v) => v.bonusIds.push(9), (_, v) => v.bonusIds = [1676],
    (_, v) => v.modifiers[0].value++, (_, v) => v.resolution.nativeScalingInputsV1[0]++,
    (_, v) => v.resolution.appliedStatsV1[1]++, (_, v) => v.resolution.appliedStatsV1.pop(),
    (_, v) => v.resolution.enhancements.socketCount++, (_, v) => v.resolution.nativeNoItemEffects = false,
    (_, v) => v.resolution.effects = [{id:1}], (_, v) => v.resolution.metadataVersion--,
  ]) {
    const changed = structuredClone(b);
    change(changed, changed.candidate.variants[0]);
    assert.notEqual(key(a), key(changed));
  }
});

test('bare ring suffix lots preserve exact stock, prices, both winners and preexisting cursors', async () => {
  for (const unique of [false, true]) for (const quantity of [1, 2]) for (const price of [10, 15]) {
    const options = slots.slice(0,2).flatMap(slot => {
      const a = suffixOffer(91, slot, 10, 1679), b = suffixOffer(92, slot, price, 1680);
      a.quantity = quantity;
      for (const o of [a, b]) o.candidate.constraints.uniqueEquipped = unique;
      return [b, a, offer(95, 31, slot, 3)];
    });
    const input = {searchId:'suffix', options, selectedSlots:slots.slice(0,2), objective:'value',
      specId:72, loadout:[], budgetCopper:25, market:{sourceUpdatedAt:new Date().toISOString()}, baseline:{engine,iterations:750,dpsError:0,confidence:95,dps:1000}, signal:new AbortController().signal,
      reuseAppliedStats:true, groupCraftedEquipment:true, maxAssignments:2,
      simulate:async selection=>({engine, iterations:750, dpsError:0, confidence:95,
        dps:1000 + selection.reduce((sum, o) => sum + (o.candidate.itemId === 21768 ? 90 : 45), 0)})};
    const finish = async (proof, cursor) => {
      for (let i=0; i<100; i++) {
        const step = await assembleAuctionGear({...input,bareEquipmentProofs:proof,checkpoint:cursor});
        if (step.result.exhaustiveComplete) return step;
        cursor = structuredClone(step.checkpoint);
      }
      assert.fail('incomplete market');
    };
    const partial = await assembleAuctionGear({...input,bareEquipmentProofs:false});
    const control = await finish(true, structuredClone(partial.checkpoint)), fresh = await finish(true);
    assert.equal(control.checkpoint.nativeLotGroups,6);
    assert.equal(fresh.checkpoint.nativeLotGroups,7);
    assert.equal(control.result.combinationCount,'16');
    assert.equal(fresh.result.combinationCount,'9');
    for (const key of ['bestDpsConfirmed','bestValueConfirmed']) {
      assert(fresh.result[key]?.purchases.length);
      assert.deepEqual(fresh.result[key],control.result[key]);
    }
  }
});
