import assert from "node:assert/strict";
import test from "node:test";
import { auctionEffectGroupKey, auctionEffectGroups, cheapestAuctionEffectSelection } from "../../../lib/wow/auctionGearEffects.ts";
import { assembleAuctionGear } from "../../../lib/wow/auctionGearPlanner.ts";
import { auctionGearMechanicalKey } from "../../../lib/wow/auctionGearMechanicalCache.ts";

const engine = "SimulationCraft 1210-01 · 18428cd";
function offer(lot, drop, price) {
  const candidate = { itemId: 258943, slotType: "WRIST", inventoryType: 9, itemClassId: 4, itemSubclassId: 4,
    eligible: true, constraints: { crafted: false, uniqueEquipped: false }, compatibility: { specId: 72 }, variants: [] };
  const variantKey = "variant-" + lot;
  candidate.variants.push({ key: variantKey, itemLevel: 133, bonusIds: [13663,13900], contextId: 11,
    modifiers: [{ type: 9, value: drop }, { type: 28, value: 3321 }],
    resolution: { metadataVersion: 3, engine, nativeNoItemEffects: true, nativeArmorCurveV1: [drop,3321,133],
      appliedStatsV1: Array(46).fill(0), enhancements: { status: "verified", socketCount: 0, socketColors: [0,0,0], socketBonusId: 0, requiredProfessionId: 0 } } });
  return { id: lot + ":WRIST:" + variantKey, auctionId: lot, costCopper: price, quantity: 1, variantKey, candidate };
}
const group = (o, current = true) => auctionEffectGroupKey(o, engine, "missive", "drop-curve", "jewelry-suffix", true, current);
function score(o, precision, altered = {}, ownedChanges = []) {
  const v = o.candidate.variants[0];
  const change = { slot: "wrist", itemId: o.candidate.itemId, contextId: v.contextId, bonusIds: v.bonusIds, modifiers: v.modifiers, ...altered };
  return auctionGearMechanicalKey("fixed-profile", { spec: "fury-warrior", scenario: "single-target", fightLengthSeconds: 120, targets: 1, precision, ownedChanges },
    { engine, changes: [change], options: [o], physicalFinalist: precision === "finalist" });
}
test("a versioned armor curve shares bare scores and retains the available physical lot", async () => {
  const first = offer(11,80,9), second = offer(12,83,6);
  assert.notEqual(group(first,false), group(second,false));
  assert.equal(group(first),group(second));
  for (const precision of [undefined, "finalist"]) assert.equal(score(first,precision),score(second,precision));
  assert.notEqual(score(first,undefined), score(second,"finalist"));
  for (const options of [[first,second],[first]]) {
    const [groups] = auctionEffectGroups(options, ["WRIST"], o=>group(o));
    assert.equal(groups.length,1);
    const purchase = await cheapestAuctionEffectSelection([groups[0]],10,new AbortController().signal);
    assert.equal(purchase.options[0].auctionId, options.length===2?12:11);
  }
});
test("incomplete evidence, changed raw input and changed customization retain physical score identities", () => {
  const a = offer(11,80,9);
  for (const change of [
    v=>{ delete v.resolution.nativeArmorCurveV1; }, v=>{v.resolution.nativeArmorCurveV1[0]++;},
    v=>{v.resolution.nativeArmorCurveV1[1]++;}, v=>{v.resolution.nativeArmorCurveV1[2]++;},
    v=>{v.resolution.engine="another engine";}, v=>{v.resolution.nativeNoItemEffects=false;},
    v=>{v.resolution.enhancements.socketCount=1;}, v=>{v.resolution.enhancements.requiredProfessionId=1;},
    v=>{v.resolution.appliedStatsV1[0]++;}, v=>{v.bonusIds.reverse();}
  ]) {
    const b=offer(12,83,6);change(b.candidate.variants[0]);
    assert.notEqual(group(a),group(b));
    assert.notEqual(score(a,"finalist"),score(b,"finalist"));
  }
  const b=offer(12,83,6);
  for (const altered of [{slot:"chest"}, {gemIds:[240967]}, {enchantId:7961}, {bonusIds:[13900]}, {contextId:55}]) {
    assert.notEqual(score(a,"finalist",altered),score(b,"finalist",altered));
  }
  assert.notEqual(score(a,"finalist",{},[{slotType:"WRIST",enchantId:7961}]),score(b,"finalist",{},[{slotType:"WRIST",enchantId:7961}]));
});
test("a version-ten cursor keeps both old armor choices when a new search groups them", async () => {
  const options=[offer(11,80,9),offer(12,83,6)],signal=new AbortController().signal;
  const baseline={engine,iterations:750,dpsError:0,confidence:95,dps:1000};
  const input={searchId:"armor-recovery", options,selectedSlots:["WRIST"],objective:"dps",specId:72,loadout:[],
    budgetCopper:10,market:{sourceUpdatedAt:new Date().toISOString()},baseline,signal,reuseAppliedStats:true,
    groupCraftedEquipment:true,maxAssignments:1,simulate:async selected=>({...baseline,dps:1000+selected.length*20})};
  const {checkpoint}=await assembleAuctionGear(input);
  assert.equal(checkpoint.nativeLotGroups,6);
  // On this fixture versions 6 through 10 use the same two distinct bare choices.
  checkpoint.nativeLotGroups=10;
  async function finish(saved) {
    for (let i=0;i<16;i++) {
      const result=await assembleAuctionGear({...input,bareEquipmentProofs:true,checkpoint:saved});
      if (result.result.exhaustiveComplete) return result;
      saved=result.checkpoint;
    }
    assert.fail("armor search did not finish");
  }
  const resumed=await finish(checkpoint),fresh=await finish(undefined);
  assert.equal(resumed.checkpoint.nativeLotGroups,10);
  assert.equal(resumed.result.combinationCount,"3");
  assert.equal(fresh.checkpoint.nativeLotGroups,11);
  assert.equal(fresh.result.combinationCount,"2");
  assert.deepEqual(fresh.result.bestDpsConfirmed,resumed.result.bestDpsConfirmed);
  assert.deepEqual(fresh.result.bestValueConfirmed,resumed.result.bestValueConfirmed);
});
