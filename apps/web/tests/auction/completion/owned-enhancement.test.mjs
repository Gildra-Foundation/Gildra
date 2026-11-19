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
