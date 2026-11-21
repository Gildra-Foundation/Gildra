import assert from "node:assert/strict";
import test from "node:test";
import { advanceAuctionGearExhaustiveEnhancements } from "../../../lib/wow/auctionGearExhaustiveEnhancements.ts";
import { midnightGemPrices } from "../../../lib/wow/auctionMidnightGemPrices.ts";
import { midnightGemRating90 } from "../../../lib/wow/auctionMidnightGemRatings.ts";
import { createExactCommodityPriceCache } from "../../../lib/wow/auctionGearCost.ts";

const a = 240864, b = 240895, c = 240896;
const positions = ["FINGER_1", "FINGER_2", "NECK"];
const itemIds = [272150, 251194, 273781];
const prices = { [a]: { ladder: [[10, 3]] }, [b]: { ladder: [[14, 3]] }, [c]: { ladder: [[40, 3]] } };

function fixture(ladders = prices, modify = () => {}, blocked = () => false) {
  const slots = positions.map((slotType, i) => ({ slotType, owned: true, allowOwnedChanges: true,
    ownedItemId: itemIds[i], sockets: [{ key: "0", type: "14" }] }));
  const axes = [[a,b],[a,b],[a,b,c]].map((ids, slot) => ids.map(id => ({ slot, socket: 0, retained: false,
    enhancement: { kind: "gem", simulationId: id, consumableItemId: id } })));
  modify(axes, slots);
  return { axes, guard: midnightGemPrices(axes, slots, createExactCommodityPriceCache(ladders).cost, blocked) };
}

test("three live physical gemstone receipts at strictly smaller exact ladder costs are required", () => {
  // 13 + 13 + 17 and all three permutations of 13 + 15 + 15 are the same
  // native mastery total and description count. Each keeps its old public key.
  const { axes, guard } = fixture();
  const rows = [];
  for (const left of axes[0]) for (const right of axes[1]) for (const neck of axes[2])
    if (guard.skips([left,right,neck])) rows.push([left,right,neck].map(x => x.enhancement.simulationId));
  assert.deepEqual(rows, [[a,a,c]]);
  for (const locked of [
    fixture({...prices, [b]: {ladder: [[14,1]]}}),
    fixture({...prices, [b]: {ladder: [[14,1],[70,2]]}}),
    fixture({...prices, [c]: {ladder: [[18,3]]}}),
    fixture(prices, axes => { axes[0][1].enhancement.category = {id:"test",limit:1}; }),
    fixture(prices, axes => { axes[0][1].retained = true; }),
    fixture(prices, axes => { axes[0][1].enhancement.uniqueEquipped = true; }),
    fixture(prices, axes => { axes[0][1].enhancement.profession = {id:1,rank:1}; }),
    fixture(prices, axes => { axes[0][1].enhancement.consumableItemId = c; }),
    fixture(prices, () => {}, choice => choice.enhancement.simulationId === b && choice.slot === 0),
    fixture(prices, (axes, slots) => {slots.push({slotType:"HEAD"});
      axes.push([{...axes[0][1],slot:3}]);}),
  ]) {
    assert.equal(locked.guard?.skips([locked.axes[0][0],locked.axes[1][0],locked.axes[2][2]]) ?? false, false);
  }
  const neckChoice = fixture(prices, axes => {
    axes.push([{slot:2,socket:null,retained:false,enhancement:null},
      {slot:2,socket:null,retained:false,enhancement:{kind:"enchant",simulationId:5317,consumableItemId:38800}}]);
  });
  const selected = [neckChoice.axes[0][0],neckChoice.axes[1][0],neckChoice.axes[2][2]];
  assert.equal(neckChoice.guard.skips([...selected,neckChoice.axes[3][0]]),true);
  assert.equal(neckChoice.guard.skips([...selected,neckChoice.axes[3][1]]),false);
  const bought = fixture(prices, (_, slots) => { slots[0].owned = false; });
  assert.equal(bought.guard, undefined);
  const enchanted = fixture(prices, (axes, slots) => { slots[2].installed = {enchant:{},gems:[null]}; });
  assert.equal(enchanted.guard, undefined);
});

test("streaming price cuts preserve complete public precision after checkpoint resumes and 64-key overflow", async () => {
  const engine = "SimulationCraft 1210-01 · 18428cd", now = new Date().toISOString();
  const items = positions.map((position, i) => ({slot:{type:position}, item:{id:itemIds[i]},
    inventory_type:{type:i === 2 ? "NECK" : "FINGER"}, level:{value:295}, item_class:{id:4},item_subclass:{id:0},
    sockets:[{socket_type:{type:"PRISMATIC"}}], spells:[]}));
  items.push({slot:{type:"CHEST"},item:{id:271459},inventory_type:{type:"CHEST"},item_class:{id:4},item_subclass:{id:4},
    level:{value:295},sockets:[],spells:[]});
  const quotes = { ...prices, 243946:{ladder:[[1,4]]}, 243974:{ladder:[[2,4]]}, 243947:{ladder:[[3,4]]} };
  const baseline = {dps:1000,dpsError:1,iterations:100,confidence:95,engine};
  function score(config) {
    const sum = config.slots.flatMap(slot => slot.gemIds).reduce((n,id) => n + (midnightGemRating90(id)?.ratings[2] ?? 0),0);
    const chest = config.slots.find(slot => slot.slotType === "CHEST").enchantId;
    return {...baseline,iterations:750,dps:1000 + (sum === 43 ? 400 : sum) + (chest === 7957 ? 4 : chest ? 1 : 0), dpsError:1.25};
  }
  async function run(enabled) {
    let calls = 0, cut = 0;
    const input = {options:[], selectedSlots:items.map(item=>item.slot.type), equipment:{equipped_items:items},
      loadout:items.map((item,i)=>({slotType:item.slot.type,itemId:item.item.id,inventoryType:[11,11,2,5][i],itemSubclassId:i===3?4:0})),
      nativePlayerLevel:90,trackBareEquipment:true,specId:72,level:90,region:"eu",engine,
      profileFingerprint:"owned-midnight-overflow",encounter:{scenario:"single-target",fightLengthSeconds:120,targets:1},
      budgetCopper:1000,objective:"value",baseline,signal:new AbortController().signal,onState:()=>{},
      simulationConcurrency:2,simulationOwnedBatch:true,simulationBatchSize:25,shouldYield:()=>false,
      quote:async()=>({prices:quotes,sourceUpdatedAt:now,fetchedAt:now}),simulate:async()=>assert.fail("Unexpected screen"),
      recheckBaseline:async()=>({...baseline,iterations:750}),recheck:async(_,config)=>{calls++;return score(config);},
      finalistKey:(_,config)=>JSON.stringify(config.ownedChanges ?? [])};
    // Before this rule, all older flags were already enabled. Run that exact
    // traversal as the independently completed reference, preserving its key on resume.
    let {state} = await advanceAuctionGearExhaustiveEnhancements({...input,shouldYield:()=>true});
    if (!enabled) delete state.pruneMidnightGemPrices;
    for (let turn = 0; turn < 60; turn++) {
      const next = await advanceAuctionGearExhaustiveEnhancements({...input,state});
      state=structuredClone(next.state);
      if (next.result.complete) {
        assert.equal(Boolean(state.pruneMidnightGemPrices),enabled);
        assert.equal(Boolean(state.precisionPass.rankReceiptsOverflow),enabled);
        for (const pass of Object.values(state.ringPricePruning ?? {})) cut+=Number(pass.configurations);
        return {result:next.result,calls,cut};
      }
    }
    assert.fail("Market did not finish");
  }
  const reference=await run(false), current=await run(true);
  assert.deepEqual(current.result,reference.result);
  assert(current.cut>0);
  assert(current.calls<reference.calls);
});
