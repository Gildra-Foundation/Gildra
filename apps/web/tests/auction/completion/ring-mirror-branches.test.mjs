import assert from 'node:assert/strict';
import test from 'node:test';
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
