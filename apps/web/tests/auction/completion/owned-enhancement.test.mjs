import assert from 'node:assert/strict';
import test from 'node:test';
import { restoreAuctionGearContext } from '../../../lib/wow/auctionGearRunner.ts';
import { createAuctionGearDiscovery } from '../../../lib/wow/auctionGearDiscovery.ts';
import { evaluateAuctionEnhancementStage } from '../../../lib/wow/auctionGearEnhancementStage.ts';
import { advanceAuctionGearExhaustiveEnhancements } from '../../../lib/wow/auctionGearExhaustiveEnhancements.ts';
import { auctionEnhancementRecords } from '../../../lib/wow/auctionEnhancementCatalog.ts';
import { buildAuctionShoppingRows } from '../../../lib/wow/auctionShoppingList.ts';

test('exact assembly upgrades selected equipped gear with commodity-only checkout and preserves its native instance', async t => {
  const engine = 'SimulationCraft 18428cd owned-fixture';
  const gems = auctionEnhancementRecords.filter(row => row.kind === 'gem' && !row.restrictionReason && !row.category && !row.profession && row.color === 14);
  const [installed, replacement] = gems;
  const enchant = auctionEnhancementRecords.find(row => row.kind === 'enchant' && row.itemClassId === 4 &&
    (row.inventoryMask & (2 ** 11)) && !row.restrictionReason && !row.profession && row.maxItemLevel === 0);
  const ring = { item:{id:123}, slot:{type:'FINGER_1'}, level:{value:295}, item_class:{id:4}, item_subclass:{id:0},
    bonus_list:[6652,13439], context:13, modified_crafting_stat:[{id:32}],
    sockets:[{socket_type:{type:'PRISMATIC'},item:{id:installed.simulationId},bonus_list:[999]}, {socket_type:{type:'PRISMATIC'}}],
    enchantments:[{enchantment_slot:{id:2},enchantment_id:777}] };
  const locked = {...structuredClone(ring), slot:{type:'FINGER_2'}, item:{id:124}};
  const equipment = {equipped_items:[ring,locked]};
  const original = structuredClone(equipment);
  const loadout = [ring,locked].map(item => ({slotType:item.slot.type,itemId:item.item.id,inventoryType:11,itemSubclassId:0}));
  const encounter = {fightLengthSeconds:120, targets:1}, sourceUpdatedAt = new Date().toISOString();
  const market = {id:'owned-only',offers:[],sourceUpdatedAt};
  const discovery = createAuctionGearDiscovery(market,25);
  discovery.engine = engine;
  const armory = {equipment,profile:{level:90},specializations:{},activeSpecializationId:72,activeTalentLoadout:'fixture'};
  const context = restoreAuctionGearContext({input:{scenario:'single-target',enhancementMode:'enhanced'},market,
    discovery,discoverySeason:{},encounter,coverage:{},currentBySlot:new Map(),profileFingerprint:'owned-only',
    armory,loadout,specId:72,specSlug:'fury-warrior',character:{playableClass:{id:1}}});
  const signal = new AbortController().signal, requests = [];
  t.mock.method(globalThis,'fetch',async (_url,init) => {
    const request = JSON.parse(init.body);
    assert.equal(request.gearChanges,undefined,'No auction replacement was sent');
    const [changed,untouched] = request.armory.equipment.equipped_items;
    assert.deepEqual(untouched,locked);
    assert.deepEqual(changed.modified_crafting_stat,ring.modified_crafting_stat);
    assert.deepEqual(changed.bonus_list,ring.bonus_list);
    assert.equal(changed.context,ring.context);
    assert.deepEqual(changed.enchantments.find(row=>row.enchantment_slot.id===2),ring.enchantments[0]);
    const dps = 1000 + (changed.sockets[0].item?.id===installed.simulationId?10:0) +
      (changed.sockets[1].item?.id===replacement.simulationId?100:0) +
      (changed.enchantments.some(row=>row.enchantment_id===enchant.simulationId)?50:0);
    requests.push(changed);
    return Response.json({dps,dpsMean:dps,dpsError:1,confidence:95,iterations:750,engine},{headers:{'x-gildra-engine':'simulationcraft'}});
  });
  const baseline = await context.simulate([],signal);
  const stage = { options:[], selectedSlots:['FINGER_1'],equipment,loadout,specId:72,level:90,region:'eu',engine,
    profileFingerprint:'owned-only',encounter:{scenario:'single-target',...encounter},budgetCopper:25,
    objective:'dps',baseline,signal,simulate:context.simulate,shouldYield:()=>false,onState:()=>{},
    quote:async(_region,ids)=>{
      assert(ids.includes(replacement.consumableItemId) && ids.includes(enchant.consumableItemId));
      return {prices:{[replacement.consumableItemId]:{ladder:[[10,1]]},[enchant.consumableItemId]:{ladder:[[15,1]]}},
        sourceUpdatedAt,fetchedAt:sourceUpdatedAt};
    }};
  const previewState = { checkpoints: {} };
  let preview;
  for (let slice = 0; slice < 16; slice++) {
    preview = await evaluateAuctionEnhancementStage({...stage, preview: true, finalists:[{label:'leader', options:[]}], state:previewState});
    if (preview.recommendations.some(row => row.configuration.consumables.length)) break;
    if (preview.complete) break;
  }
  const priced = preview.recommendations.find(row => row.configuration.consumables.length);
  assert(priced, 'seeded preview finds a purchasable improvement to the equipped ring');
  assert(priced.configuration.totalCopper <= stage.budgetCopper);
  assert(priced.comparison.deltaDps > 0);
  assert(priced.configuration.ownedChanges.every(change => change.slotType === 'FINGER_1'));
  let next;
  for(let step=0;step<20;step++) {
    next = await advanceAuctionGearExhaustiveEnhancements({...stage,state:next?.state});
    if(next.result.complete) break;
  }
  assert.equal(next.result.complete,true);
  assert.equal(next.result.equipmentChecked,1);
  const best = next.result.recommendations[0], config = best.configuration;
  assert.deepEqual(best.purchases,[]);
  assert.equal(config.itemsCopper,0);
  assert.equal(config.totalCopper,25);
  assert.equal(best.comparison.deltaDps,150);
  assert.deepEqual(config.ownedChanges,[{slotType:'FINGER_1',itemId:123,gems:[{index:1,itemId:replacement.simulationId}],enchantId:enchant.simulationId}]);
  assert.deepEqual(buildAuctionShoppingRows(best.purchases,config.consumables,best.consumableNames).map(row=>row.itemId).sort(),
    [replacement.consumableItemId,enchant.consumableItemId].sort());
  assert(requests.some(row=>row.sockets[1].item?.id===replacement.simulationId &&
    row.sockets[0].bonus_list?.[0]===999 && row.enchantments.some(e=>e.enchantment_id===enchant.simulationId)));
  assert.deepEqual(equipment,original);
});

test('bare worn gloves skip profession-only purchases and keep socket upgrades at exact pricing', async () => {
  const engine = 'SimulationCraft 1210-01 · 18428cd';
  const glove = {item:{id:271457}, slot:{type:'HANDS'}, inventory_type:{type:'HAND'},
    level:{value:270}, item_class:{id:4}, item_subclass:{id:4}, spells:[], sockets:[{socket_type:{type:'PRISMATIC'}}]};
  const prices = {38960:{ladder:[[30,10]]}, 128558:{ladder:[[40,10]]}, 130215:{ladder:[[50,10]]}};
  async function measured(item, enabled, revision = engine) {
    const state = {checkpoints:{}}, calls = [];
    const baseline = {dps:1000,dpsError:1,confidence:95,iterations:100,engine:revision};
    for (let turn = 0; turn < 20; turn++) {
      const result = await evaluateAuctionEnhancementStage({exhaustive:true,omitNeutralGloveEnchants:enabled,
        finalists:[{label:'exhaustive',options:[]}], equipment:{equipped_items:[item]},
        loadout:[{slotType:'HANDS',itemId:271457,inventoryType:10,itemSubclassId:4}], selectedSlots:['HANDS'],
        specId:72,level:90,region:'eu',engine:revision,profileFingerprint:'glove-facts',
        encounter:{scenario:'single-target',fightLengthSeconds:120,targets:1},budgetCopper:100,objective:'dps',
        baseline,state,signal:new AbortController().signal,shouldYield:()=>false,
        quote:async() => ({prices,sourceUpdatedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()}),
        simulate:async(_options,_signal,edits) => {
          calls.push(edits?.[0] ?? {});
          return {...baseline,dps:edits?.[0]?.gems.length ? 1100 : 1000};
        }});
      if (result.complete) return calls;
    }
    assert.fail('glove fixture did not exhaust');
  }
  for (const item of [glove,{...glove,enchantments:[]}]) {
    const calls = await measured(item,true);
    assert.equal(calls.length,2);
    assert(calls.every(row=>!row.enchantId));
    assert(calls.some(row=>row.gems?.[0].itemId===130215));
  }
  for (const [item,enabled,revision] of [
    [glove,false,engine], [glove,true,'SimulationCraft 18428cd fixture'],
    [{...glove,enchantments:[{enchantment_slot:{id:0},enchantment_id:3238}]},true,engine],
    [{...glove,enchantments:[{enchantment_slot:{id:2},enchantment_id:777}]},true,engine],
  ]) {
    const calls=await measured(item,enabled,revision);
    assert(calls.some(row=>row.enchantId===5444));
  }
});

test('shoulder illusions cannot improve an unenchanted purchase or an unenchanted owned shoulder', async () => {
  const engine = 'SimulationCraft 1210-01 · 18428cd';
  const item = {item:{id:271454}, slot:{type:'SHOULDER'}, inventory_type:{type:'SHOULDER'},
    level:{value:270}, item_class:{id:4}, item_subclass:{id:4}, spells:[], sockets:[]};
  const option = {id:'new-shoulder', auctionId:18, costCopper:200, quantity:1, variantKey:'shoulder',
    candidate:{itemId:237924, name:'Shoulder', slotType:'SHOULDER', inventoryType:3, itemClassId:4, itemSubclassId:4,
      eligible:true, compatibility:{specId:72}, constraints:{requiredLevel:1},
      variants:[{key:'shoulder', itemLevel:270, contextId:0, bonusIds:[], resolution:{effectsVerified:true, effects:[],
        metadataVersion:3, enhancements:{status:'verified', socketColors:[0,0,0], socketCount:0, socketBonusId:0, requiredProfessionId:0, requiredProfessionRank:0}}}]}};
  const prices = {201315:{ladder:[[10,10]]},243961:{ladder:[[20,10]]}};
  async function run(owned, installed, revision = engine, enabled = true) {
    const state={checkpoints:{}}, measured=new Set();
    const baseline={dps:1000,dpsError:1,confidence:95,iterations:100,engine:revision};
    const shoulder = installed ? {...item,enchantments:[{enchantment_slot:{id:0},enchantment_id:7970}]} : item;
    for(let turn=0;turn<12;turn++) {
      const result=await evaluateAuctionEnhancementStage({exhaustive:true,omitShoulderIllusions:enabled,
        finalists:[{label:'exhaustive',options:owned?[]:[option]}], equipment:{equipped_items:[shoulder]},
        loadout:[{slotType:'SHOULDER',itemId:item.item.id,inventoryType:3,itemSubclassId:4}],selectedSlots:['SHOULDER'],
        specId:72,level:90,region:'eu',engine:revision,profileFingerprint:'shoulder',encounter:{},budgetCopper:1000,
        baseline,state,signal:new AbortController().signal,shouldYield:()=>false,
        quote:async()=>({prices,sourceUpdatedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()}),
        simulate:async(options,_signal,edits)=>{
          measured.add(options[0]?.customization?.enchantId ?? edits?.[0]?.enchantId ?? 0);
          return baseline;
        }});
      if(result.complete)return measured;
    }
    assert.fail('shoulder fixture did not finish');
  }
  for (const owned of [true,false]) {
    const calls = await run(owned,false);
    assert(calls.has(0));assert(calls.has(7971));assert(!calls.has(6685));
    assert((await run(owned,false,engine,false)).has(6685));
    assert((await run(owned,false,'SimulationCraft 18428cd unknown')).has(6685));
  }
  assert((await run(true,true)).has(6685),'An illusion can replace an existing combat enchant');
});

test('owned jewelry gem substitutions preserve scarce stock, installed gems, and receipt prices', async () => {
  const engine='SimulationCraft 1210-01 · 18428cd', cheap=115804, dear=115811;
  const slots=['NECK','FINGER_1'];
  const loadout=slots.map((slotType,i)=>({slotType,itemId:1500+i,inventoryType:i ? 11 : 2,itemSubclassId:0}));
  const baseline={engine,dps:1000,dpsError:1,confidence:95,iterations:750};
  async function market({ladder=[[2,2]],nativePlayerLevel=90,enabled=true,installed,ringEnchant,unknownHost=false}={}) {
    const items=loadout.map((row,i)=>({slot:{type:row.slotType},inventory_type:{type:unknownHost?'UNKNOWN':i?'FINGER':'NECK'},
      item:{id:row.itemId},item_class:{id:4},item_subclass:{id:0},level:{value:270},
      sockets:[{socket_type:{type:'PRISMATIC'},...(i && installed ? {item:{id:installed},bonus_list:[123]}:{})}],
      ...(i && ringEnchant ? {enchantments:[{enchantment_slot:{id:0},enchantment_id:ringEnchant}]}:{})}));
    const prices={[cheap]:{ladder},[dear]:{ladder:[[5,2]]}};
    const state={checkpoints:{}},receipts=[];
    for(let turn=0;turn<24;turn++) {
      const result=await evaluateAuctionEnhancementStage({exhaustive:true,pruneOwnedJewelryGems:enabled,nativePlayerLevel,
        finalists:[{label:'exhaustive',options:[]}],equipment:{equipped_items:items},loadout,selectedSlots:slots,
        specId:72,level:90,region:'eu',engine,profileFingerprint:'owned-gem-cost',encounter:{},budgetCopper:100,
        baseline,state,signal:new AbortController().signal,shouldYield:()=>false,
        quote:async()=>({prices,sourceUpdatedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()}),
        simulate:async()=>baseline,
        onMeasured:config=>receipts.push({edits:(config.ownedChanges??[]).map(edit=>[edit.slotType,edit.gems[0]?.itemId]),cost:config.totalCopper})});
      if(result.complete)return receipts;
    }
    assert.fail('expected exhaustive receipts for both owned sockets');
  }
  const positive=await market();
  assert.equal(positive.length,4);
  assert.deepEqual(positive.find(r=>r.edits.length===2)?.cost,4);
  assert(positive.every(r=>r.edits.every(([,id])=>id===cheap)));
  for(const ladder of [[[2,1]],[[2,1],[5,1]],[[2,1],[8,1]]]) {
    const exact=await market({ladder});
    assert(exact.some(r=>r.cost===7 && r.edits.length===2 && new Set(r.edits.map(e=>e[1])).size===2));
    assert(exact.some(r=>r.edits.length===2 && r.edits.every(([,id])=>id===dear)));
  }
  for(const flags of [{enabled:false},{nativePlayerLevel:89},{unknownHost:true}]) assert.equal((await market(flags)).length,9);
  const installed=await market({installed:dear});
  assert(installed.some(r=>r.edits.length===0 && r.cost===0),'retaining the installed gem costs nothing');
  const proc=await market({ringEnchant:7967});
  assert(proc.some(r=>r.edits.some(([slot,id])=>slot==='FINGER_1' && id===dear)));
});

test('hearthstone scrolls can be omitted only when the unchanged wrist is available', async () => {
  const engine = 'SimulationCraft 1210-01 · 18428cd';
  const slotType = 'WRIST', inventoryType = 9, itemId = 1234;
  const item = {item:{id:itemId}, slot:{type:slotType}, inventory_type:{type:'WRIST'}, level:{value:270},
    item_class:{id:4}, item_subclass:{id:4}, spells:[], sockets:[]};
  const candidate = {itemId:5000, name:'Bracers', slotType, inventoryType, itemClassId:4, itemSubclassId:4, eligible:true,
    compatibility:{specId:72}, constraints:{requiredLevel:1}, variants:[{key:'wrist', itemLevel:270, contextId:0, bonusIds:[],
      resolution:{effectsVerified:true, effects:[], metadataVersion:3, enhancements:{status:'verified', socketColors:[0,0,0],
        socketCount:0, socketBonusId:0, requiredProfessionId:0, requiredProfessionRank:0}}}]};
  const option = {id:'wrist', auctionId:20, costCopper:200, quantity:1, variantKey:'wrist', candidate};
  const prices = {160328:{ladder:[[10,1]]},172416:{ladder:[[20,1]]}};
  async function measured({owned=true, equipped=item, enabled=true, revision=engine} = {}) {
    const state = {checkpoints:{}}, ids = new Set();
    const baseline = {dps:1000, dpsError:1, confidence:95, iterations:100, engine:revision};
    for (let step=0; step<12; step++) {
      const stage = await evaluateAuctionEnhancementStage({exhaustive:true, omitWristHearthEnchants:enabled,
        finalists:[{label:'exhaustive', options:owned?[]:[option]}], equipment:{equipped_items:[equipped]},
        loadout:[{slotType,itemId,inventoryType,itemSubclassId:4}],selectedSlots:[slotType],specId:72,level:90,
        region:'eu',engine:revision,profileFingerprint:'hearth',encounter:{},budgetCopper:1000,baseline,state,
        signal:new AbortController().signal, shouldYield:()=>false,
        quote:async()=>({prices,sourceUpdatedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()}),
        simulate:async(options,_signal,edits)=>{
          ids.add(options[0]?.customization?.enchantId ?? edits?.[0]?.enchantId ?? 0);
          return baseline;
        }});
      if (stage.complete) return ids;
    }
    assert.fail('wrist fixture did not exhaust');
  }
  const all = new Set([0,5970,6222]);
  for (const owned of [true,false]) {
    assert.deepEqual(await measured({owned}), new Set([0]));
    assert.deepEqual(await measured({owned,enabled:false}), all);
    assert.deepEqual(await measured({owned,revision:'SimulationCraft 18428cd unknown'}), all);
  }
  assert.deepEqual(await measured({equipped:{...item,enchantments:[{enchantment_slot:{id:2},enchantment_id:777}]}}), all);
  assert.deepEqual(await measured({equipped:{...item,enchantments:[{enchantment_slot:{id:0},enchantment_id:369}]}}), all);
});
