import assert from "node:assert/strict";
import test from "node:test";
import { advanceAuctionGearExhaustiveEnhancements } from "../../../lib/wow/auctionGearExhaustiveEnhancements.ts";
import { midnightGemPrices } from "../../../lib/wow/auctionMidnightGemPrices.ts";
import { combinedRingRatings90 } from "../../../lib/wow/auctionRingRatings.ts";
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
    if (guard.cutAxis([left,right,neck]) !== undefined) rows.push([left,right,neck].map(x => x.enhancement.simulationId));
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
    assert.equal(locked.guard?.cutAxis([locked.axes[0][0],locked.axes[1][0],locked.axes[2][2]]), undefined);
  }
  const neckChoice = fixture(prices, axes => {
    axes.push([{slot:2,socket:null,retained:false,enhancement:null},
      {slot:2,socket:null,retained:false,enhancement:{kind:"enchant",simulationId:5317,consumableItemId:38800}}]);
  });
  const selected = [neckChoice.axes[0][0],neckChoice.axes[1][0],neckChoice.axes[2][2]];
  assert.equal(neckChoice.guard.cutAxis([...selected,neckChoice.axes[3][0]]),0);
  assert.equal(neckChoice.guard.cutAxis([...selected,neckChoice.axes[3][1]]),undefined);
  const bought = fixture(prices, (_, slots) => { slots[0].owned = false; });
  assert.equal(bought.guard, undefined);
  const enchanted = fixture(prices, (axes, slots) => { slots[2].installed = {enchant:{},gems:[null]}; });
  assert.equal(enchanted.guard, undefined);
});

// Three strictly cheaper Eversong receipts with two colored gems and one
// legacy haste gem. Keep each host's raw gem ID as the public purchase.
const mixedSource = [115804, 240869, 240887];
const mixedWitnesses = [[240861,240867,115804], [240867,240861,115804], [240855,240869,151583]];
const mixedPrices = {115804:15, 240869:30, 240887:70, 240861:10, 240867:11, 240855:12, 151583:8};
function mixedFixture(rows, price, enabled = true, excluded = () => false) {
  const slots = positions.map((slotType,i) => ({slotType, owned:true, allowOwnedChanges:true,
    ownedItemId:itemIds[i], sockets:[{key:"0",type:"14"}]}));
  const axes = slots.flatMap((_,slot) => {
    const gems = [...new Set(rows.map(row=>row[slot]))].map(id=>({slot,socket:0,retained:false,
      enhancement:{kind:"gem", simulationId:id, consumableItemId:id}}));
    return slot === 2 ? [gems] : [[null,7964,7966].map(id=>({slot,socket:null,retained:!id,
      enhancement:id && {kind:"enchant",simulationId:id,consumableItemId:id+1000000}})),gems];
  });
  const quotes = Object.fromEntries(Object.entries(price).map(([id,p])=>[id,{ladder:[[p,3]]}]));
  const guard = midnightGemPrices(axes,slots,createExactCommodityPriceCache(quotes).cost,excluded,enabled);
  return (row, enchant = 7964) => guard?.cutAxis(axes.map(choices=>choices.find(c=>
    (c.enhancement?.simulationId ?? 0) === (c.socket === null ? enchant : row[c.slot]))));
}

test("mixed triples preserve lower enchant digits, strict prices and distinct original finalists", () => {
  const rows = [mixedSource,...mixedWitnesses];
  const cut = mixedFixture(rows,mixedPrices);
  assert.equal(cut(mixedSource),0);
  assert.equal(cut(mixedSource,0),0);
  assert.equal(cut(mixedSource,7966),undefined);
  for (const witness of mixedWitnesses) assert.equal(cut(witness),undefined);
  assert.equal(mixedFixture(rows,mixedPrices,false)(mixedSource),undefined);
  assert.equal(mixedFixture(rows,mixedPrices,true,c=>c.enhancement.simulationId === 151583)(mixedSource),undefined);
  // A tie with the third witness must be left for the complete receipt hash.
  assert.equal(mixedFixture(rows,{...mixedPrices,240887:5})(mixedSource),undefined);
  // Three cheap legacy SKUs at one position have the same native rating
  // and the same historic finalist key. They supply exactly one witness.
  const aliasRows = [[240856,240863,115804], ...[127761,130216,153711].map(id=>[240855,240863,id])];
  const aliasPrices = {240856:100,240855:1,240863:10,115804:20,127761:1,130216:2,153711:3};
  assert.equal(mixedFixture(aliasRows,aliasPrices)(aliasRows[0]),undefined);
});

for (const rule of ["strict", "mixed", "tied", "two"]) test(`streaming ${rule} gem receipts preserve complete rankings across checkpoints and overflow`, async () => {
  const mixed = rule === "mixed", two = rule === "two", tied = two || rule === "tied";
  const engine = "SimulationCraft 1210-01 · 18428cd", now = new Date().toISOString();
  const items = positions.map((position, i) => ({slot:{type:position}, item:{id:itemIds[i]},
    inventory_type:{type:i === 2 ? "NECK" : "FINGER"}, level:{value:295}, item_class:{id:4},item_subclass:{id:0},
    sockets:[{socket_type:{type:"PRISMATIC"}}], spells:[]}));
  items.push({slot:{type:"CHEST"},item:{id:271459},inventory_type:{type:"CHEST"},item_class:{id:4},item_subclass:{id:4},
    level:{value:295},sockets:[],spells:[]});
  const gemPrices = mixed ? Object.fromEntries(Object.entries(mixedPrices).map(([id,p])=>[id,{ladder:[[p,3]]}])) : prices;
  const quotes = { ...gemPrices, 243946:{ladder:[[1,4]]}, 243974:{ladder:[[2,4]]}, 243947:{ladder:[[3,4]]} };
  const baseline = {dps:1000,dpsError:1,iterations:100,confidence:95,engine};
  function score(config) {
    const totals = [0,0,0,0];
    for (const id of config.slots.flatMap(slot=>slot.gemIds)) {
      const stats = midnightGemRating90(id)?.ratings ?? combinedRingRatings90(0,id);
      stats.forEach((amount,i)=>{totals[i]+=amount;});
    }
    const sum = mixed ? totals.reduce((n,v,i)=>n+v*(i+1),0) : totals[2];
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
    if (!two || !enabled) delete state.twoGemWitnesses;
    if (!tied || !enabled && !two) delete state.pruneTiedMidnightGems;
    if (!enabled && !tied) {
      delete state.pruneMixedMidnightPrices;
      if (!mixed) delete state.pruneMidnightGemPrices;
    }
    for (let turn = 0; turn < 500; turn++) {
      const next = await advanceAuctionGearExhaustiveEnhancements({...input,state});
      state=structuredClone(next.state);
      if (next.result.complete) {
        assert.equal(Boolean(state.pruneMidnightGemPrices),tied || mixed || enabled);
        assert.equal(Boolean(state.pruneMixedMidnightPrices),tied || enabled);
        assert.equal(Boolean(state.pruneTiedMidnightGems),tied && (two || enabled));
        assert.equal(Boolean(state.twoGemWitnesses),two && enabled);
        assert.equal(Boolean(state.precisionPass.rankReceiptsOverflow),tied || mixed || enabled);
        for (const pass of Object.values((tied ? state.jewelryTiePruning : state.ringPricePruning) ?? {})) cut+=Number(pass.configurations);
        return {result:next.result,calls,cut};
      }
    }
    assert.fail("Market did not finish");
  }
  const reference=await run(false), current=await run(true);
  assert.deepEqual(current.result,reference.result);
  assert(current.cut>reference.cut);
  assert(current.calls<reference.calls);
});

test("cheaper weapon scrolls can pay for three differently ranked gemstone receipts", () => {
  const low = 38991, high = 38878;
  const gem = [240869,240867,240877];
  const levels = Object.fromEntries(gem.map(id => [id,{ladder:[[10,3]]}]));
  function books(lowLadder = [[12,2]], highPrice = 25, mutate = () => {}) {
    const slots = ["MAIN_HAND","FINGER_1","FINGER_2","NECK","OFF_HAND"].map(slotType => {
      const owned = positions.includes(slotType);
      return {slotType,owned,allowOwnedChanges:owned,ownedItemId:owned ? itemIds[positions.indexOf(slotType)] : undefined,
        sockets:owned ? [{key:"0",type:"14"}] : []};
    });
    const axes = slots.map((host,slot) => host.owned ? gem.map(id => ({slot,socket:0,retained:false,
      enhancement:{kind:"gem",simulationId:id,consumableItemId:id}})) : [0,3830,2505].map(id =>
      ({slot,socket:null,retained:false,enhancement:id ? {kind:"enchant",simulationId:id,consumableItemId:id === 3830 ? low : high} : null})));
    mutate(axes,slots);
    const cost=createExactCommodityPriceCache({...levels,[low]:{ladder:lowLadder},[high]:{ladder:[[highPrice,2]]}}).cost;
    const enabled=midnightGemPrices(axes,slots,cost,()=>false,false,true);
    const previous=midnightGemPrices(axes,slots,cost,()=>false);
    const row=(left,right,ids)=>axes.map((axis,i)=>i===0?axis[left]:i===4?axis[right]:i<4?axis[ids[i-1]]:axis[0]);
    return {row,enabled,previous};
  }
  const {row,enabled,previous}=books();
  const expensive=row(2,0,[0,0,1]);
  assert.equal(previous.cutAxis(expensive),undefined);
  assert.equal(enabled.cutAxis(expensive),0); // The first hand is below all three socket digits.
  for(const indices of [[0,0,1],[0,1,0],[1,0,0]]) assert.equal(enabled.cutAxis(row(1,1,indices)),undefined);
  assert.equal(enabled.cutAxis(row(2,0,[0,0,0])),undefined); // Only one distinct gemstone arrangement.
  for(const fixture of [
    books([[12,1]]), books([[12,1],[13,1]]), books([[12,1],[14,1]]),
    books([[12,2]],25,(axes)=>{axes[0][1].enhancement.profession={id:1,rank:1};}),
    books([[12,2]],25,(axes)=>{axes[0][1].enhancement.category={id:"limit",limit:1};}),
    books([[12,2]],25,(axes)=>{axes[4][1].enhancement.uniqueEquipped=true;}),
    books([[12,2]],25,(axes)=>{axes[4][1].retained=true;}),
    books([[12,2]],25,(_,slots)=>{slots[0].owned=true;}),
    books([[12,2]],25,(_,slots)=>{slots[4].sockets=[{key:"0",type:"14"}];}),
    books([[12,2]],25,(axes,slots)=>{slots.push({slotType:"HEAD",sockets:[],owned:true});
      axes.push([{...axes[0][1],slot:5}]);}),
    books([[12,2]],25,(axes)=>{axes[4][1].enhancement.simulationId=4083;}),
  ]) assert.equal(fixture.enabled.cutAxis(fixture.row(2,0,[0,0,1])),undefined);
});

test("equal-price gem orders preserve other digits and count distinct legal placements", () => {
  function full(modify = () => {}) {
    return fixture(prices, (axes, slots) => {
      for (const axis of axes.slice(0, 2)) axis.push({...axis[0], enhancement:{...axis[0].enhancement, simulationId:c, consumableItemId:c}});
      axes.unshift([{slot:3,socket:null,retained:true,enhancement:null}, {slot:3,socket:null,retained:false,enhancement:null}]);
      slots.push({slotType:"CHEST",sockets:[]});
      modify(axes,slots);
    });
  }
  const {guard} = full();
  const selected = [1,0,1,2];
  assert.deepEqual(guard.tiedGemOrders(selected), [[1,0,2,1],[1,1,0,2],[1,1,2,0],[1,2,0,1],[1,2,1,0]]);
  assert.deepEqual(selected,[1,0,1,2]);
  assert.equal(guard.tiedGemOrders([1,0,0,1]),undefined);
  assert.deepEqual(guard.tiedGemOrders([1,0,0,1],2), [[1,0,1,0],[1,1,0,0]]);
  assert.equal(guard.tiedGemOrders([1,0,0,0],2),undefined);
  const restricted = full(axes => { axes[1][2].retained = true; axes[2][2].enhancement.profession = {id:1,rank:1}; });
  assert.equal(restricted.guard.tiedGemOrders(selected),undefined);
  const enchanted = full(axes => { axes.push([{slot:2,socket:null,retained:false,enhancement:{kind:"enchant",simulationId:5317,consumableItemId:38800}}]); });
  assert.equal(enchanted.guard.tiedGemOrders([...selected,0]),undefined);
});
