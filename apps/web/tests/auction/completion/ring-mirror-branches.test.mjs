import assert from 'node:assert/strict';
import test from 'node:test';
import { auctionEffectGroupKey } from '../../../lib/wow/auctionGearEffects.ts';
import { auctionGearMechanicalKey } from '../../../lib/wow/auctionGearMechanicalCache.ts';
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
test('bare Weapon Damage ring swaps only with an unmodified native effect program', () => {
  const groups = [slots[0], slots[1]].map(slot => [
    {options: [offer(1, 30804, slot, 10)]}, {options: [offer(10, 21768, slot, 20)]},
  ]);
  const eachBand = update => groups.forEach(axis => update(axis[0].options[0]));
  const skips = () => auctionRingMirrorOrder(groups, slots.slice(0, 2), engine, 72)?.skips([1, 2]) ?? false;
  eachBand(o => {
    delete o.candidate.variants[0].resolution.nativeNoItemEffects;
    o.candidate.variants[0].resolution.effects = [];
    o.candidate.variants[0].modifiers = [{type: 28, value: 1418}];
  });
  assert(skips());
  for (const mutation of [
    o => o.candidate.itemId++,
    o => o.candidate.variants[0].bonusIds.push(13668),
    o => o.candidate.variants[0].modifiers.push({type: 9, value: 82}),
    o => delete o.candidate.variants[0].resolution.effects,
    o => o.candidate.variants[0].resolution.effects = [{spellId: 123}],
    o => o.customization = {enchantId: 7964},
  ]) {
    const changed = structuredClone(groups);
    for (const axis of changed) mutation(axis[0].options[0]);
    assert(!auctionRingMirrorOrder(changed, slots.slice(0, 2), engine, 72)?.skips([1, 2]));
  }
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
    assert.equal(fresh.checkpoint.nativeLotGroups,12);
    assert.equal(control.result.combinationCount,'16');
    assert.equal(fresh.result.combinationCount,'9');
    for (const key of ['bestDpsConfirmed','bestValueConfirmed']) {
      assert(fresh.result[key]?.purchases.length);
      assert.deepEqual(fresh.result[key],control.result[key]);
    }
  }
});

function curveOffer(lot, slot, bonus, tuning) {
  const option = offer(lot, 258910, slot, 60, String(bonus));
  const v = option.candidate.variants[0];
  Object.assign(v, {itemLevel:133, contextId:133, bonusIds:[13668, bonus], modifiers:[{type:9,value:82},{type:28,value:tuning}]});
  v.resolution.nativeDropCurveV1 = [82, tuning, 133];
  Object.assign(v.resolution.enhancements, {socketCount:1,socketColors:[14,0,0]});
  return option;
}

test('socketed ring curves compare only bound levels, native stats and matching paid upgrades', () => {
  const a = curveOffer(81, slots[0], 13729, 3087), b = curveOffer(82, slots[0], 13900, 3321);
  const key = (o, version) => auctionEffectGroupKey(o, engine, "missive", "drop-curve", version);
  assert.equal(key(a, 'socket-curve'), key(b, 'socket-curve'));
  assert.notEqual(key(a, true), key(b, true));
  const score = (o, enchantId, gemId, precision, edit = () => {}) => {
    const v = o.candidate.variants[0];
    const gear = {slot:'finger1', itemId:o.candidate.itemId, contextId:v.contextId, bonusIds:v.bonusIds,
      modifiers:v.modifiers, enchantId, gemIds:gemId ? [gemId] : []};
    edit(gear);
    return auctionGearMechanicalKey('actor', {spec:'fury',scenario:'single-target',fightLengthSeconds:120,targets:1,precision},
      {changes:[gear], options:[o], engine, playerLevel:90});
  };
  for (const precision of [undefined, 'finalist']) {
    for (const [enchant, gem] of [[0,0],[7994,0],[0,130219],[7994,130219]]) {
      assert.equal(score(a,enchant,gem,precision),score(b,enchant,gem,precision));
    }
    for (const [enchant, gem] of [[99999,0],[0,99999]]) assert.notEqual(score(a,enchant,gem,precision),score(b,enchant,gem,precision));
    assert.notEqual(score(a,7994,0,precision),score(b,7995,0,precision));
    assert.notEqual(score(a,0,130219,precision),score(b,0,130220,precision));
    for (const edit of [g => g.itemId++, g => g.slot = 'finger2', g => g.bonusIds = [13668,13900],
      g => g.modifiers = [{type:9,value:81}], g => g.gemIds = [130219,130219]]) {
      assert.notEqual(score(a,7994,130219,precision,edit),score(b,7994,130219,precision));
    }
  }
  assert.notEqual(score(a,7994,130219),score(b,7994,130219,'finalist'));
  for (const change of [
    (_,v) => v.bonusIds.reverse(), (_,v) => v.bonusIds.push(41), (_,v) => v.bonusIds[0]++,
    (_,v) => v.itemLevel++, (_,v) => v.resolution.nativeDropCurveV1[1]--,
    (_,v) => v.resolution.appliedStatsV1[7]++, (_,v) => v.resolution.nativeNoItemEffects = false,
    (_,v) => v.resolution.enhancements.socketColors = [0,14,0], (_,v) => v.resolution.enhancements.socketBonusId = 5203,
    (o) => o.candidate.itemId++, (o) => o.candidate.constraints.uniqueEquipped = true,
    (o) => o.customization = {gemIds:[130219]},
  ]) {
    const row = structuredClone(b);
    change(row, row.candidate.variants[0]);
    assert.notEqual(key(a,'socket-curve'),key(row,'socket-curve'));
  }
});

test('a v7 bare curve cursor resumes its original domain; new cursors allocate physical lots jointly', async () => {
  for (const quantity of [1, 2]) {
    const options = slots.slice(0,2).flatMap(slot => {
      const a = curveOffer(81, slot, 13729, 3087), b = curveOffer(82, slot, 13900, 3321);
      a.quantity = quantity;
      return [b, a, offer(85,31,slot,25)];
    });
    const input = {searchId:'curves',options,selectedSlots:slots.slice(0,2),specId:72,loadout:[],budgetCopper:120,
      market:{sourceUpdatedAt:new Date().toISOString()},signal:new AbortController().signal,groupCraftedEquipment:true,
      reuseAppliedStats:true,maxAssignments:1,baseline:{engine,iterations:750,dpsError:0,confidence:95,dps:1000},
      simulate:async sel=>({engine,iterations:750,dpsError:0,confidence:95,dps:1000+sel.reduce((n,o)=>n+(o.candidate.itemId===31?50:100),0)})};
    const finish = async checkpoint => {
      for (let step=0;step<200;step++) {
        const run = await assembleAuctionGear({...input,bareEquipmentProofs:true,checkpoint});
        if (run.result.exhaustiveComplete) return run;
        checkpoint = structuredClone(run.checkpoint);
      }
      assert.fail('incomplete curve market');
    };
    const partial = await assembleAuctionGear(input);
    // v6 and v7 group these offers identically; v7 also supports unrelated legacy suffixes.
    const old = await finish({...partial.checkpoint,nativeLotGroups:7}), fresh = await finish();
    assert.equal(old.result.combinationCount,'16');
    assert.equal(fresh.result.combinationCount,'9');
    for (const field of ['bestValueConfirmed','bestDpsConfirmed']) assert.deepEqual(fresh.result[field],old.result[field]);
    const peak=fresh.result.bestDpsConfirmed;
    assert.equal(peak.spentCopper, quantity===1 ? 120 : 60);
    assert.deepEqual(peak.purchases.map(o=>o.auctionId).sort(),quantity===1 ? [81,82] : [81,81]);
  }
});

test('socketless jewelry retains suffix names, physical stat vectors and independent finalist scores', () => {
  const neck = (lot, bonus, context) => {
    const o = suffixOffer(lot, 'NECK', 20, bonus);
    Object.assign(o.candidate, {itemId:83794,inventoryType:2,itemSubclassId:0});
    o.candidate.variants[0].contextId = context;
    return o;
  };
  const a=neck(81,1677,0), b=neck(82,1678,1);
  const key=(o,version="jewelry-suffix") => auctionEffectGroupKey(o,engine,"missive","drop-curve",version);
  assert.equal(key(a),key(b));
  assert.notEqual(key(a,"socket-curve"),key(b,"socket-curve"));
  const score=(o,precision,mutate=()=>{}) => {
    const v=o.candidate.variants[0], change={slot:'neck',itemId:o.candidate.itemId,contextId:v.contextId,
      modifiers:v.modifiers,bonusIds:v.bonusIds};
    mutate(change);
    return auctionGearMechanicalKey('character',{spec:'fury',scenario:'single-target',targets:1,fightLengthSeconds:120,precision},
      {changes:[change],options:[o],engine});
  };
  for (const precision of [undefined,'finalist']) {
    assert.equal(score(a,precision),score(b,precision));
    for (const mutate of [c=>c.enchantId=5439,c=>c.gemIds=[130219],c=>c.slot='finger1',c=>c.itemId++,
      c=>c.modifiers=[],c=>c.contextId=175,c=>c.bonusIds=[c.bonusIds[0],6652]]) {
      assert.notEqual(score(a,precision,mutate),score(b,precision,mutate));
    }
  }
  const enchanted = (o,enchantId,gemIds) => ({...o,customization:{enchantId,gemIds}});
  const scoreEnchant = (o,precision,id) => score(o,precision,c=>c.enchantId=id);
  for (const precision of [undefined,'finalist']) {
    const base=scoreEnchant(enchanted(a,5285),precision,5285);
    assert.equal(base,scoreEnchant(enchanted(b,5285),precision,5285));
    assert.notEqual(base,scoreEnchant(enchanted(b,5292),precision,5292));
    assert.notEqual(base,scoreEnchant(enchanted(b,5292),precision,5285));
    assert.notEqual(base,scoreEnchant(enchanted(b,5285,[130219]),precision,5285));
    assert.notEqual(base,scoreEnchant(b,precision,5285));
    assert.notEqual(base,score(b,precision));
    assert.notEqual(scoreEnchant(enchanted(a,5437),precision,5437),scoreEnchant(enchanted(b,5437),precision,5437));
    assert.notEqual(key(enchanted(a,5285)),key(enchanted(b,5285)));
  }
  assert.notEqual(scoreEnchant(enchanted(a,5285),undefined,5285),scoreEnchant(enchanted(b,5285),'finalist',5285));
  assert.notEqual(score(a),score(b,'finalist'));
  for(const change of [o=>o.customization={enchantId:5439},o=>o.candidate.itemId=158075,o=>o.candidate.constraints.uniqueEquipped=true,
    (_,v)=>v.bonusIds=[1683],(_,v)=>v.contextId=-1,(_,v)=>v.itemLevel++,(_,v)=>v.resolution.appliedStatsV1[28]++,
    (_,v)=>v.resolution.nativeScalingInputsV1[1]++,(_,v)=>v.resolution.metadataVersion=2,
    (_,v)=>v.resolution.enhancements.socketColors=[14,0,0],(_,v)=>v.resolution.nativeNoItemEffects=false]) {
    const altered=structuredClone(b);change(altered,altered.candidate.variants[0]);assert.notEqual(key(a),key(altered));
  }
  const c=neck(83,108,13), d=neck(84,188,13);
  assert.notEqual(key(c),key(d));
  c.candidate.variants[0].resolution.nativeSuffixProgramV1='a'.repeat(64);
  d.candidate.variants[0].resolution.nativeSuffixProgramV1='b'.repeat(64);
  assert.equal(key(c),key(d));
  assert.notEqual(key(c),key(b));
});

test('purchased direct ring scrolls share only the physical fight of certified equivalent rating suffixes', () => {
  const first = suffixOffer(201, slots[0], 20, 1679), second = suffixOffer(202, slots[0], 20, 1680);
  function score(original, enchantId, configure = () => {}) {
    const option = structuredClone(original), variant = option.candidate.variants[0];
    option.customization = {enchantId};
    const change = {slot:'finger1', itemId:option.candidate.itemId, bonusIds:variant.bonusIds, modifiers:variant.modifiers, enchantId};
    const request = {spec:'fury', scenario:'single-target', targets:1, fightLengthSeconds:120, precision:'finalist'};
    const native = {changes:[change], options:[option], engine, playerLevel:90, physicalFinalist:true};
    configure({option, variant, change, request, native});
    return auctionGearMechanicalKey('profile',request,native);
  }
  for (const enchant of [5940,5941,5299]) assert.equal(score(first,enchant),score(second,enchant));
  assert.notEqual(score(first,5940),score(second,5941));
  assert.notEqual(score(first,5940),score(second,5299));
  for (const configure of [
    ({native}) => {native.physicalFinalist=false;}, ({native}) => {native.playerLevel=89;},
    ({request}) => {delete request.precision;}, ({change}) => {change.gemIds=[130219];},
    ({option}) => {option.customization.gemIds=[130219];}, ({change}) => {change.enchantId=5439;},
    ({option}) => {delete option.candidate.constraints;},
    ({native,change}) => {native.changes.push(change);}, ({request}) => {request.removedSlots=[slots[0]];},
    ({request}) => {request.ownedChanges=[{slotType:slots[0], enchantId:5940}];},
    ({variant}) => {variant.resolution.nativeNoItemEffects=false;},
    ({variant}) => {variant.resolution.enhancements.socketCount=1;},
  ]) assert.notEqual(score(first,5940,configure),score(second,5940,configure));
  assert.notEqual(score(first,5439), score(second,5439));
});
