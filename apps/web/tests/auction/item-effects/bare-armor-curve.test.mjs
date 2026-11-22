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
function score(o, precision, altered = {}, ownedChanges = [], physicalFinalist = precision === "finalist") {
  const v = o.candidate.variants[0];
  const change = { slot: "wrist", itemId: o.candidate.itemId, contextId: v.contextId, bonusIds: v.bonusIds, modifiers: v.modifiers, ...altered };
  return auctionGearMechanicalKey("fixed-profile", { spec: "fury-warrior", scenario: "single-target", fightLengthSeconds: 120, targets: 1, precision, ownedChanges },
    { engine, changes: [change], options: [o], physicalFinalist });
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
  assert.equal(fresh.checkpoint.nativeLotGroups,14);
  assert.equal(fresh.result.combinationCount,"2");
  assert.deepEqual(fresh.result.bestDpsConfirmed,resumed.result.bestDpsConfirmed);
  assert.deepEqual(fresh.result.bestValueConfirmed,resumed.result.bestValueConfirmed);
});

test("two no-op armor prefixes can share a resolved curve with both precisions", () => {
  const a=offer(1208555828,81,35000000), b=offer(1208961221,82,35000000);
  a.candidate.variants[0].bonusIds=[13578,13729];
  for (const x of [a,b]) x.candidate.variants[0].resolution.effects=[];
  assert.notEqual(group(a),group(b));
  assert.equal(group(a,"equivalent-curves"),group(b,"equivalent-curves"));
  for (const precision of [undefined,"finalist"]) assert.equal(score(a,precision),score(b,precision));
  assert.notEqual(score(a),score(b,"finalist"));
  assert.notEqual(score(a,"finalist",{},[],false),score(b,"finalist",{},[],false));
  for (const invalidate of [
    v=>{v.bonusIds=[13578,13900];}, v=>{v.bonusIds=[13663,13729];},
    v=>{v.bonusIds=[13663,13900,13901];}, v=>{v.bonusIds.reverse();},
    v=>{v.resolution.effects=["equip"];}, v=>{delete v.resolution.effects;},
    v=>{v.resolution.appliedStatsV1[45]++;}, v=>{v.resolution.nativeArmorCurveV1[2]++;},
  ]) {
    const changed=structuredClone(b);
    invalidate(changed.candidate.variants[0]);
    assert.notEqual(group(a,"equivalent-curves"),group(changed,"equivalent-curves"));
    assert.notEqual(score(a,"finalist"),score(changed,"finalist"));
  }
});

test("a resumed version-eleven search and new grouping keep the same physical DPS and value receipts", async () => {
  async function compare(firstId, secondId, firstPrice, secondPrice, grouped) {
    const a=offer(21,81,firstPrice), b=offer(32,82,secondPrice);
    a.id=firstId; b.id=secondId;
    a.candidate.variants[0].bonusIds=[13578,13729];
    for (const x of [a,b]) x.candidate.variants[0].resolution.effects=[];
    const head=offer(47,82,2);
    head.id="z"; head.candidate.slotType="HEAD"; head.candidate.inventoryType=1; head.candidate.itemId=258947;
    const baseline={engine,iterations:750,dpsError:0,confidence:95,dps:1000};
    const input={searchId:"curve-program-receipts", options:[a,b,head],selectedSlots:["WRIST","HEAD"],
      loadout:[],specId:72,budgetCopper:20,market:{sourceUpdatedAt:new Date().toISOString()},
      signal:new AbortController().signal,baseline,reuseAppliedStats:true,groupCraftedEquipment:true,
      bareEquipmentProofs:true,simulate:async selected=>({...baseline,dps:1000+(selected.length===2 ? 100 : 0)})};
    // The legacy grouping has the same three physical groups in this fixture.
    // Resume after an actual ordinal with cached fights and a partial result.
    let prior;
    for (let step=0;step<8;step++) {
      const row=await assembleAuctionGear({...input,bareEquipmentProofs:false,maxAssignments:1,checkpoint:prior});
      prior=row.checkpoint;
      if (prior.cursor.some(Boolean)) break;
    }
    assert(prior.cursor.some(Boolean) && !prior.exhausted);
    prior.nativeLotGroups=11;
    const resumed=await assembleAuctionGear({...input,checkpoint:prior});
    const fresh=await assembleAuctionGear(input);
    assert.equal(resumed.checkpoint.nativeLotGroups,11);
    assert.equal(resumed.result.exhaustiveComplete,true);
    assert.equal(fresh.result.exhaustiveComplete,true);
    assert.equal(resumed.result.combinationCount,"6");
    assert.equal(fresh.result.combinationCount,grouped ? "4" : "6");
    for (const k of ["best","bestDpsConfirmed","bestValueConfirmed"])
      assert.deepEqual(fresh.checkpoint[k],resumed.checkpoint[k]);
    return fresh.checkpoint.bestDpsConfirmed.optionIds.sort();
  }
  assert.deepEqual(await compare("a","b",3,3,true),["a","z"]);
  assert.deepEqual(await compare("a","b",4,3,true),["b","z"]);
  // Here "a0|z" wins the public tie against "a|z".
  assert.deepEqual(await compare("a","a0",3,3,false),["a0","z"]);
});

function craftedWrist(lot, stat, price = 3) {
  const option = offer(lot, 80, price);
  option.candidate.constraints.crafted = true;
  const variant = option.candidate.variants[0];
  variant.bonusIds = [8794, 12245, 12497, 13760, 13762, 13763];
  variant.modifiers = [{ type: 28, value: 3615 }, { type: 29, value: stat }, { type: 30, value: 49 }];
  delete variant.resolution.nativeArmorCurveV1;
  return option;
}

test("a verified armor missive shares the physical fight while preserving the public finalist key", () => {
  const a = craftedWrist(11, 32), b = craftedWrist(12, 40);
  const key = option => auctionEffectGroupKey(option, engine, "missive", "drop-curve", "jewelry-suffix", true, "curves-and-missives");
  assert.equal(key(a), key(b));
  assert.notEqual(group(a, "equivalent-curves"), group(b, "equivalent-curves"));
  assert.notEqual(score(a, "finalist", {}, [], false), score(b, "finalist", {}, [], false));
  for (const edit of [{}, {enchantId: 7956}, {gemIds: [240967]}]) {
    assert.equal(score(a, undefined, edit), score(b, undefined, edit));
    assert.equal(score(a, "finalist", edit), score(b, "finalist", edit));
  }
  assert.notEqual(score(a, "finalist", {enchantId: 7956}), score(b, "finalist"));
  assert.notEqual(score(a, "finalist", {gemIds: [240967]}), score(b, "finalist"));
  for (const change of [
    v => { v.bonusIds = v.bonusIds.filter(id => id !== 8794); }, v => v.bonusIds.reverse(),
    v => { v.bonusIds[0] = 8792; }, v => { v.modifiers[0].value++; },
    v => { v.modifiers.push({ type: 99, value: 1 }); }, v => { v.resolution.metadataVersion = 2; },
    v => { v.resolution.engine = "other"; }, v => { delete v.resolution.enhancements; },
    v => { v.resolution.appliedStatsV1[45]++; }, v => { v.itemLevel++; },
    v => { v.resolution.nativeNoItemEffects = false; }, v => { v.resolution.effects = ["equip"]; },
  ]) {
    const c = structuredClone(b);
    change(c.candidate.variants[0]);
    assert.notEqual(key(a), key(c));
    assert.notEqual(score(a, "finalist"), score(c, "finalist"));
  }
  assert.notEqual(score(a, "finalist", {slot: "head"}), score(b, "finalist", {slot: "head"}));
});

test("the bare missive branch preserves both recommendations, each lot card, and the previous cursor", async () => {
  for (const [left, right, price, expectedCount, winner] of [
    ["a", "b", 3, "4", "a"], ["a", "b", 2, "4", "b"], ["a", "a0", 3, "6", "a0"],
  ]) {
    const a = craftedWrist(11,32), b = craftedWrist(12,40,price), head = offer(13,80,1);
    a.id = left; b.id = right; head.id = "z"; head.candidate.slotType = "HEAD"; head.candidate.itemId++;
    head.candidate.inventoryType = 1;
    const baseline = { engine, iterations: 100, dps: 1000, confidence: 95, dpsError: 0 };
    const fight = async (selected, iterations) => ({ ...baseline, iterations, dps: 1000 + (selected.length === 2 ? 90 : 0) });
    const input = { searchId: "missive-receipts", options: [a,b,head], selectedSlots: ["HEAD","WRIST"],
      budgetCopper: 5, specId: 72, market: {sourceUpdatedAt: new Date().toISOString()}, loadout: [], baseline,
      signal: new AbortController().signal, reuseAppliedStats: true, groupCraftedEquipment: true, bareEquipmentProofs: true,
      preciseSingleCards: true, simulate: selected => fight(selected, 100), recheckEquipment: selected => fight(selected, 750) };
    const old = await assembleAuctionGear({...input, screeningGroupVersion: 12, maxAssignments: 1});
    const resumed = await assembleAuctionGear({...input, checkpoint: old.checkpoint});
    const fresh = await assembleAuctionGear(input);
    for (const [run, version, count] of [[resumed, 12, "6"], [fresh, 14, expectedCount]]) {
      assert.equal(run.checkpoint.nativeLotGroups, version);
      assert.equal(run.checkpoint.equipmentVerification.nativeLotGroups, version);
      assert.equal(run.result.exhaustiveComplete, true);
      assert.equal(run.result.combinationCount, count);
      assert.deepEqual(new Set(run.preciseSingles.byOption.keys()), new Set([left,right,"z"]));
      assert.equal(run.preciseSingles.byOption.get(right).iterations, 750);
    }
    for (const field of ["bestDpsConfirmed","bestValueConfirmed"]) {
      assert.deepEqual(fresh.result[field], resumed.result[field]);
      assert.deepEqual(fresh.checkpoint.equipmentVerification[field].optionIds.slice().sort(), [winner,"z"]);
    }
  }
});
