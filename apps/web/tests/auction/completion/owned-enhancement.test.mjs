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
  const prices = {201315:{ladder:[[10,10]]},243961:{ladder:[[20,10]]},244018:{ladder:[[30,10]]}};
  async function run(owned, installed, revision = engine, enabled = true, omitInertFuryLeech = false) {
    const state={checkpoints:{}}, measured=new Set();
    const baseline={dps:1000,dpsError:1,confidence:95,iterations:100,engine:revision};
    const shoulder = installed ? {...item,enchantments:[{enchantment_slot:{id:0},enchantment_id:7970}]} : item;
    for(let turn=0;turn<12;turn++) {
      const result=await evaluateAuctionEnhancementStage({exhaustive:true,omitShoulderIllusions:enabled,omitInertFuryLeech,
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
    assert(calls.has(8028));assert(!(await run(owned,false,engine,true,true)).has(8028));
    assert(calls.has(0));assert(calls.has(7971));assert(!calls.has(6685));
    assert((await run(owned,false,engine,false)).has(6685));
    assert((await run(owned,false,'SimulationCraft 18428cd unknown')).has(6685));
  }
  assert((await run(true,true,engine,true,true)).has(8028),'An existing shoulder enchant can be replaced');
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

test('only a fresh full search with native Fury healing evidence removes pure helm leech', async () => {
  const engine = 'SimulationCraft 1210-01 · 18428cd', slotType='HEAD', itemId=271456;
  const item={item:{id:itemId},slot:{type:slotType},inventory_type:{type:'HEAD'},level:{value:270},
    item_class:{id:4},item_subclass:{id:4},sockets:[],spells:[]};
  const prices={243948:{ladder:[[10,2]]},243949:{ladder:[[20,2]]}};
  async function run({evidence,specId=72,revision=engine,historical=false}) {
    const baseline={dps:1000,dpsError:1,confidence:95,iterations:100,engine:revision,
      ...(evidence ? {furyWithoutLeechHealingV1:true} : {})};
    const seen=new Set();
    const input={options:[],selectedSlots:[slotType],equipment:{equipped_items:[item]},loadout:[{slotType,itemId,inventoryType:1,itemSubclassId:4}],
      specId,level:90,region:'eu',engine:revision,profileFingerprint:'leech',encounter:{},budgetCopper:1000,objective:'dps',baseline,
      simulate:async(_options,_signal,edits)=>{seen.add(edits?.[0]?.enchantId??0);return baseline},
      quote:async()=>({prices,sourceUpdatedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()}),
      signal:new AbortController().signal,shouldYield:()=>false,onState:()=>{}};
    let state, historicalKey;
    if (historical) {
      // Make an actual pre-capability cursor, then resume with the new worker's baseline.
      const older={...input,baseline:{...baseline},shouldYield:()=>true};
      delete older.baseline.furyWithoutLeechHealingV1;
      state=(await advanceAuctionGearExhaustiveEnhancements(older)).state;
      historicalKey=state.inputKey;
      seen.clear();
    }
    for (let slice=0;slice<30;slice++) {
      const step=await advanceAuctionGearExhaustiveEnhancements({...input,state});
      state=step.state;
      if (historical) assert.equal(state.inputKey,historicalKey);
      if (step.result.complete) return seen;
    }
    assert.fail('helm receipts did not exhaust');
  }
  assert.deepEqual(await run({evidence:true}),new Set([0]));
  const all=new Set([0,7958,7959]);
  assert.deepEqual(await run({evidence:false}),all);
  assert.deepEqual(await run({evidence:true,specId:71}),all);
  assert.deepEqual(await run({evidence:true,revision:'SimulationCraft 18428cd unknown'}),all);
  assert.deepEqual(await run({evidence:true,historical:true}),all);
});

test('Cradle can stay free on a bare weapon, but removing an installed combat enchant requires a purchase', async () => {
  const engine = 'SimulationCraft 1210-01 · 18428cd';
  const equipped = (slotType, id, installed) => ({
    item:{id}, slot:{type:slotType}, inventory_type:{type:'TWOHWEAPON'}, level:{value:334},
    item_class:{id:2}, item_subclass:{id:1}, spells:[], sockets:[],
    ...(installed ? {enchantments:[{enchantment_slot:{id:0},enchantment_id:installed}]} : {}),
  });
  const main = equipped('MAIN_HAND',1001,0), off = equipped('OFF_HAND',1002,7983);
  const candidate = {itemId:1003,name:'Axe',slotType:'MAIN_HAND',inventoryType:17,itemClassId:2,itemSubclassId:1,
    eligible:true,compatibility:{specId:72},constraints:{requiredLevel:1},variants:[{key:'axe',itemLevel:334,
      contextId:0,bonusIds:[],resolution:{effectsVerified:true,effects:[],metadataVersion:3,enhancements:{
        status:'verified',socketCount:0,socketColors:[0,0,0],socketBonusId:0,requiredProfessionId:0,requiredProfessionRank:0}}}]};
  const option = {id:'axe',auctionId:30,costCopper:3,quantity:1,variantKey:'axe',candidate};
  async function market({items=[main,off], enabled=true, options=[], cheap=[[1,2]], revision=engine}={}) {
    const state={checkpoints:{}}, choices=new Set();
    const baseline={dps:1000,dpsError:1,confidence:95,iterations:100,engine:revision};
    for (let step=0;step<50;step++) {
      const result=await evaluateAuctionEnhancementStage({exhaustive:true,pruneCradleEnchants:enabled,
        finalists:[{label:'exhaustive',options}],equipment:{equipped_items:items},
        loadout:items.map(i=>({slotType:i.slot.type,itemId:i.item.id,inventoryType:17,itemSubclassId:1})),
        selectedSlots:items.map(i=>i.slot.type),specId:72,level:90,region:'eu',engine:revision,
        profileFingerprint:'worldsoul',encounter:{},budgetCopper:100,baseline,state,
        signal:new AbortController().signal,shouldYield:()=>false,
        quote:async()=>({prices:{243996:{ladder:cheap},243997:{ladder:[[5,2]]},243998:{ladder:[[8,2]]},243999:{ladder:[[9,2]]}},
          sourceUpdatedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()}),
        simulate:async()=>baseline,onMeasured:c=>choices.add(c.slots.map(s=>s.enchantId).join(','))});
      if (result.complete) return choices;
    }
    assert.fail('weapon enchant combinations did not exhaust');
  }
  const expected=new Set([0,8008,8009].flatMap(m=>[7983,8006,8008,8009].map(o=>[m,o].join(','))));
  assert.deepEqual(await market(),expected);
  assert.deepEqual(await market({options:[option]}),expected);
  for (const args of [{enabled:false},{revision:'SimulationCraft 18428cd different build'}])
    assert.equal((await market(args)).size,25);
  const installed=await market({items:[equipped('MAIN_HAND',1001,8007)]});
  assert.deepEqual(installed,new Set(['8007','8008','8009']));
  const both=[equipped('MAIN_HAND',1001,7983),off];
  for (const cheap of [[[1,1]],[[1,1],[5,1]],[[1,1],[6,1]]])
    assert((await market({items:both,cheap})).has('8007,8006'),'another hand may consume the last cheap scroll');
});

test('paid neck scrolls require an available strictly cheaper equivalent and keep the installed scroll free', async () => {
  const engine='SimulationCraft 1210-01 · 18428cd';
  async function choices({price=5,mark=9,level=90,installed,enabled=true}={}) {
    const item={item:{id:115991},slot:{type:'NECK'},inventory_type:{type:'NECK'},level:{value:16},
      item_class:{id:4},item_subclass:{id:0},sockets:[],spells:[],
      enchantments:installed ? [{enchantment_slot:{id:0},enchantment_id:installed}] : []};
    const state={checkpoints:{}},seen=new Set(),baseline={dps:1000,dpsError:1,confidence:95,iterations:100,engine};
    const prices={128551:{ladder:[[14,1]]},144307:{ladder:[[mark,1]]}};
    if(price!==null) prices[110645]={ladder:[[price,1]]};
    for(let i=0;i<30;i++) {
      const result=await evaluateAuctionEnhancementStage({exhaustive:true,pruneNeckEnchantRanks:enabled,
        finalists:[{label:'exhaustive',options:[]}],equipment:{equipped_items:[item]},
        loadout:[{slotType:'NECK',itemId:115991,inventoryType:2,itemSubclassId:0}],selectedSlots:['NECK'],
        nativePlayerLevel:level,specId:72,level:90,region:'eu',engine,profileFingerprint:'neck-scrolls',
        encounter:{},budgetCopper:100,baseline,state,signal:new AbortController().signal,shouldYield:()=>false,
        quote:async()=>({prices,sourceUpdatedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()}),
        simulate:async()=>baseline,onMeasured:c=>seen.add(c.slots[0].enchantId)});
      if(result.complete) return [...seen].sort((a,b)=>a-b);
    }
    assert.fail('neck scroll fixtures did not exhaust');
  }
  assert.deepEqual(await choices(),[0,5317,5437]);
  assert.deepEqual(await choices({price:10}),[0,5437,5898]);
  assert.deepEqual(await choices({price:null}),[0,5437,5898]);
  for(const args of [{price:9},{enabled:false},{level:89}])assert.deepEqual(await choices(args),[0,5317,5437,5898]);
  assert((await choices({installed:5898})).includes(5898));
});

test('both ring positions retain equal-price scrolls and can use the last cheap copy plus a substitute', async () => {
  const engine='SimulationCraft 1210-01 · 18428cd';
  const selectedSlots=['FINGER_1','FINGER_2'];
  const items=selectedSlots.map((slot,id)=>({item:{id:173131+id},slot:{type:slot},inventory_type:{type:'FINGER'},
    level:{value:35},item_class:{id:4},item_subclass:{id:0},spells:[],sockets:[]}));
  const loadout=items.map(x=>({slotType:x.slot.type,itemId:x.item.id,inventoryType:11,itemSubclassId:0}));
  async function choices(ladder,{level=90,enabled=true,revision=engine}={}) {
    const state={checkpoints:{}},seen=new Map(),baseline={dps:1000,dpsError:1,confidence:95,iterations:100,engine:revision};
    for(let i=0;i<40;i++) {
      const result=await evaluateAuctionEnhancementStage({exhaustive:true,pruneRingEnchantRanks:enabled,
        finalists:[{label:'exhaustive',options:[]}],equipment:{equipped_items:items},loadout,selectedSlots,
        nativePlayerLevel:level,specId:72,level:90,region:'eu',engine:revision,profileFingerprint:'dual-ring-scrolls',
        encounter:{},budgetCopper:100,baseline,state,signal:new AbortController().signal,shouldYield:()=>false,
        quote:async()=>({prices:{128538:{ladder},110639:{ladder:[[5,2]]}},sourceUpdatedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()}),
        simulate:async()=>baseline,onMeasured:c=>seen.set(c.slots.map(slot=>slot.enchantId).join(','),c.totalCopper)});
      if(result.complete)return seen;
    }
    assert.fail('ring scroll fixtures did not exhaust');
  }
  const compact=await choices([[1,2]]);
  assert.deepEqual([...compact.keys()].sort(),['0,0','0,5424','5424,0','5424,5424']);
  assert.equal(compact.get('5424,5424'),2);
  for(const ladder of [[[1,1]],[[1,1],[5,1]],[[1,1],[8,1]]]){
    const all=await choices(ladder);
    assert.equal(all.get('5424,5325'),6);
    assert.equal(all.get('5325,5424'),6);
    assert.equal(all.has('5424,5424'),ladder.length===2);
  }
  for(const options of [{level:89},{enabled:false},{revision:'SimulationCraft 18428cd different build'}]){
    assert.equal((await choices([[1,2]],options)).get('5325,5325'),10);
  }
});

test('owned armor exchanges require bare verified hosts and the exact native engine and level', async () => {
  const engine='SimulationCraft 1210-01 · 18428cd';
  const hosts=[['HEAD',271456,1],['SHOULDER',271454,3],['FEET',268260,8]];
  const loadout=hosts.map(([slotType,itemId,inventoryType])=>({slotType,itemId,inventoryType,itemSubclassId:4}));
  async function enumerate({revision=engine,level=90,headEnchant,enabled=true}={}) {
    const items=hosts.map(([slot,id])=>({item:{id},slot:{type:slot},inventory_type:{type:slot},level:{value:295},
      item_class:{id:4},item_subclass:{id:4},sockets:[],spells:[],
      ...(slot==='HEAD' && headEnchant ? {enchantments:[{enchantment_slot:{id:0},enchantment_id:headEnchant}]} : {})}));
    const state={checkpoints:{}}, keys=new Set(), baseline={dps:1000,dpsError:1,iterations:100,confidence:95,engine:revision};
    const prices=Object.fromEntries([[243979,4],[243960,5],[243961,8]].map(([id,price])=>[id,{ladder:[[price,1]]}]));
    for (let i=0;i<32;i++) {
      const result=await evaluateAuctionEnhancementStage({exhaustive:true,pruneArmorEnchantPairs:enabled,
        finalists:[{label:'exhaustive',options:[]}],equipment:{equipped_items:items},loadout,
        selectedSlots:hosts.map(([slot])=>slot),nativePlayerLevel:level,specId:72,level:90,region:'eu',engine:revision,
        profileFingerprint:'armor-prices',encounter:{},budgetCopper:100,baseline,state,signal:new AbortController().signal,
        shouldYield:()=>false,quote:async()=>({prices,sourceUpdatedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()}),
        simulate:async()=>baseline,onMeasured:c=>keys.add(c.slots.map(s=>s.enchantId).join(','))});
      if (result.complete) return keys;
    }
    assert.fail('armor exchange fixture did not finish');
  }
  const kept=await enumerate();
  assert(kept.has('0,0,7971'));
  assert(!kept.has('0,7989,7970'));
  for (const inputs of [{revision:'SimulationCraft 18428cd different build'},{level:89},{headEnchant:7958},{enabled:false}])
    assert((await enumerate(inputs)).has('0,7989,7970'),JSON.stringify(inputs));
});

test('a ring scroll can be exchanged across bare socketless worn rings only at certified player level', async () => {
  const engine='SimulationCraft 1210-01 · 18428cd', selectedSlots=['FINGER_1','FINGER_2'];
  const loadout=selectedSlots.map((slotType,index)=>({slotType,itemId:173131+index,inventoryType:11,itemSubclassId:0}));
  async function search({level=90,enabled=true,installed=false,revision=engine}={}) {
    const items=loadout.map((x,i)=>({item:{id:x.itemId},slot:{type:x.slotType},inventory_type:{type:'FINGER'},level:{value:35},
      item_class:{id:4},item_subclass:{id:0},sockets:[],spells:[],...(i===0 && installed ?
        {enchantments:[{enchantment_slot:{id:0},enchantment_id:5425}]} : {})}));
    const baseline={dps:1000,dpsError:1,confidence:95,iterations:100,engine:revision},state={checkpoints:{}},seen=new Set();
    const prices={110618:{ladder:[[3,2]]},128542:{ladder:[[4,2]]},199954:{ladder:[[6,2]]}};
    for(let i=0;i<32;i++) {
      const result=await evaluateAuctionEnhancementStage({exhaustive:true,pruneRingScrollPairs:enabled,selectedSlots,
        finalists:[{label:'exhaustive',options:[]}],equipment:{equipped_items:items},loadout,nativePlayerLevel:level,
        specId:72,level:90,region:'eu',engine:revision,profileFingerprint:'two-bare-rings',encounter:{},budgetCopper:50,
        baseline,state,signal:new AbortController().signal,shouldYield:()=>false,
        quote:async()=>({prices,sourceUpdatedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()}),
        simulate:async()=>baseline,onMeasured:c=>seen.add(c.slots.map(s=>s.enchantId).join('/'))});
      if(result.complete)return seen;
    }
    assert.fail('socketless rings did not finish');
  }
  const small=await search();
  assert(small.has('5428/5428'));
  for(const args of [{enabled:false},{level:89},{installed:true},{revision:'SimulationCraft 18428cd different build'}]) {
    const full=await search(args);
    assert(full.size>small.size,JSON.stringify(args));
  }
});

test('a bare owned ring can supply a gem to a cheaper equal-rating two-ring purchase', async () => {
  const engine='SimulationCraft 1210-01 · 18428cd', selectedSlots=['FINGER_1','FINGER_2'];
  const loadout=selectedSlots.map((slotType,i)=>({slotType,itemId:[272150,251194][i],inventoryType:11,itemSubclassId:0}));
  const source='8027:154128/0:115807', replacement='8026:154128/0:154128';
  async function receipts({enabled=true,level=90,revision=engine,opaque=false,secondUnit=3,stock=2,single=false}={}) {
    const items=loadout.map((s,i)=>({item:{id:s.itemId},slot:{type:s.slotType},inventory_type:{type:'FINGER'},
      item_class:{id:4},item_subclass:{id:0},level:{value:i?292:321},sockets:[{socket_type:{type:'PRISMATIC'}}],
      ...(opaque && i===1 ? {enchantments:[{enchantment_slot:{id:2},enchantment_id:777}]} : {})}));
    const ladder=[[3,secondUnit===3 ? stock : 1]];
    if(stock>1 && secondUnit!==3)ladder.push([secondUnit,1]);
    const prices={244017:{ladder:[[6,2]]},244016:{ladder:[[2,2]]},115807:{ladder:[[1,2]]},154128:{ladder}};
    if(single){delete prices[244016];delete prices[244017];}
    const state={checkpoints:{}},seen=new Map(),baseline={dps:1000,dpsError:1,confidence:95,iterations:100,engine:revision};
    for(let i=0;i<100;i++){
      const result=await evaluateAuctionEnhancementStage({exhaustive:true,pruneOwnedJewelryGems:true,
        pruneBareOwnedRingRatings:enabled,selectedSlots:single?['FINGER_1']:selectedSlots,finalists:[{label:'exhaustive',options:[]}],
        equipment:{equipped_items:items},loadout,nativePlayerLevel:level,specId:72,level:90,region:'eu',engine:revision,
        profileFingerprint:'owned-rating-substitution',encounter:{},budgetCopper:50,baseline,state,
        signal:new AbortController().signal,shouldYield:()=>false,
        quote:async()=>({prices,sourceUpdatedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()}),
        simulate:async()=>baseline,onMeasured:c=>seen.set(c.slots.map(s=>s.enchantId+':'+s.gemIds.join()).join('/'),c.totalCopper)});
      if(result.complete)return seen;
    }
    assert.fail('owned ring-gem market did not finish');
  }
  // A resumable layout can have a bare host but no strictly cheaper witness.
  assert((await receipts({single:true})).size>1);
  const compact=await receipts();
  assert(!compact.has(source));
  assert.equal(compact.get(replacement),8);
  for(const args of [{enabled:false},{level:89},{revision:'SimulationCraft 18428cd different build'},{opaque:true},{stock:1},{secondUnit:5}])
    assert.equal((await receipts(args)).get(source),10,JSON.stringify(args));
});

test('legacy weapon scrolls need a strictly cheaper substitute available for every hand', async () => {
  const engine = 'SimulationCraft 1210-01 · 18428cd';
  const slots = ['MAIN_HAND', 'OFF_HAND'];
  function option(slotType, index, proofEngine) {
    const variant = { key: 'staff', itemLevel: 10, contextId: 0, bonusIds: [], resolution: {
      engine: proofEngine, metadataVersion: 3, effectsVerified: true, effects: [], enhancements: {
        status: 'verified', socketCount: 0, socketColors: [0, 0, 0], socketBonusId: 0,
        requiredProfessionId: 0, requiredProfessionRank: 0,
      },
    } };
    return { id: slotType, auctionId: 100 + index, costCopper: 5, quantity: 1, variantKey: 'staff',
      candidate: { itemId: 2030 + index, name: 'Staff', slotType, inventoryType: 17, itemClassId: 2,
        itemSubclassId: 10, eligible: true, compatibility: { specId: 72 }, constraints: { requiredLevel: 1 }, variants: [variant] } };
  }
  async function run({ cheap = [[5, 2]], other = [[10, 2]], enabled = true, level = 90, proofEngine = engine } = {}) {
    const seen = new Set(), state = { checkpoints: {} };
    const baseline = { dps: 1000, dpsError: 1, confidence: 95, iterations: 750, engine };
    const options = slots.map((slot, i) => option(slot, i, proofEngine));
    const now = new Date().toISOString();
    const prices = {38920: {ladder: other}};
    if (cheap) prices[38879] = {ladder: cheap};
    for (let i = 0; i < 20; i++) {
      const stage = await evaluateAuctionEnhancementStage({ exhaustive: true, pruneWeaponEnchantRanks: enabled,
        finalists: [{ label: 'both weapons', options }], equipment: { equipped_items: [] }, loadout: [],
        selectedSlots: slots, level: 90, nativePlayerLevel: level, specId: 72, region: 'eu', engine,
        profileFingerprint: 'weapon-scrolls', budgetCopper: 100, encounter: {}, baseline, state,
        signal: new AbortController().signal, shouldYield: () => false,
        quote: async () => ({prices, sourceUpdatedAt: now, fetchedAt: now}), simulate: async () => baseline,
        onMeasured: configuration => seen.add(configuration.slots.map(slot => slot.enchantId).join(',')),
      });
      if (stage.complete) return seen;
    }
    assert.fail('weapon scrolls did not exhaust');
  }
  const physical = await run({ enabled: false });
  assert.equal(physical.size, 9);
  assert.deepEqual(await run(), new Set(['0,0', '0,2563', '2563,0', '2563,2563']));
  assert.deepEqual(await run({ cheap: null }), new Set(['0,0', '0,2668', '2668,0', '2668,2668']));
  for (const args of [{ cheap: [[10, 2]] }, { cheap: [[5, 1], [11, 1]] }, { level: 89 }, { proofEngine: 'unverified' }]) {
    assert.deepEqual(await run(args), physical);
  }
  const lastCopy = await run({ cheap: [[5, 1]] });
  assert(lastCopy.has('2563,2668') && lastCopy.has('2668,2563') && !lastCopy.has('2563,2563'));
});

test('weapon scroll pruning preserves older exhaustive search cursors', async () => {
  const engine = 'SimulationCraft 1210-01 · 18428cd';
  const baseline = {dps: 1000, dpsError: 1, confidence: 95, iterations: 100, engine};
  const input = {options: [], selectedSlots: ['MAIN_HAND'], equipment: {equipped_items: []}, loadout: [],
    specId: 72, level: 90, region: 'eu', engine, profileFingerprint: 'older-weapon-scroll-cursor',
    encounter: {}, budgetCopper: 1000, objective: 'dps', baseline, simulate: async () => baseline,
    signal: new AbortController().signal, shouldYield: () => true, onState: () => {}};
  const old = (await advanceAuctionGearExhaustiveEnhancements(input)).state;
  assert.equal(old.pruneWeaponEnchantRanks, undefined);
  const current = { ...input, nativePlayerLevel: 90 };
  const resumed = (await advanceAuctionGearExhaustiveEnhancements({ ...current, state: old })).state;
  const fresh = (await advanceAuctionGearExhaustiveEnhancements(current)).state;
  assert.equal(resumed.inputKey, old.inputKey);
  assert.equal(resumed.pruneWeaponEnchantRanks, undefined);
  assert.equal(fresh.pruneWeaponEnchantRanks, true);
  assert.notEqual(fresh.inputKey, old.inputKey);
});
