import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { assembleAuctionGear, auctionPlanCost, searchAuctionGearOptions } from "../lib/wow/auctionGearPlanner.ts";
import { auctionEffectGroups, cheapestAuctionEffectSelection } from "../lib/wow/auctionGearEffects.ts";
import { equipmentCompatibility } from "../lib/wow/gearCompatibility.ts";
import { prepareGearLoadout } from "../lib/wow/gearSimulation.ts";

// All cases are synthetic offline inputs. No worker, market, or character API is called.
function candidate(slot, itemId, constraints = {}) {
  const inventoryType = { HEAD: 1, NECK: 2, SHOULDER: 3, BACK: 16, CHEST: 5, WRIST: 9,
    HANDS: 10, WAIST: 6, LEGS: 7, FEET: 8, FINGER_1: 11, FINGER_2: 11,
    TRINKET_1: 12, TRINKET_2: 12, MAIN_HAND: 13, OFF_HAND: 13 }[slot];
  const itemClassId = slot.endsWith("HAND") ? 2 : 4;
  const itemSubclassId = itemClassId === 2 || [2, 11, 12, 16].includes(inventoryType) ? 0 : 4;
  const result = { entityId: `synthetic-${itemId}`, itemId, name: `Synthetic ${itemId}`, slotType: slot,
    itemLevel: 100, inventoryType, itemClassId, itemSubclassId,
    season: { id: "s", patch: "p", status: "current", evidence: "synthetic" },
    source: { type: "auction", evidence: "auction" },
    constraints: { uniqueEquipped: false, requiredLevel: 1, ...constraints },
    compatibility: { specId: 72, method: "specialization", itemClassId, itemSubclassId },
    provenance: { buildId: 1 }, eligible: true, rejectionReasons: [],
    variants: [{ key: "base", itemLevel: 100, contextId: 0, bonusIds: [] }] };
  assert.equal(equipmentCompatibility({ classId: 1, specId: 72, ...result }), null, `invalid_synthetic_slot:${slot}`);
  return result;
}
const option = (id, slot, itemId = id, extra = {}) => ({ id: `${id}:${slot}`, auctionId: id,
  quantity: 1, costCopper: 10, candidate: candidate(slot, itemId), variantKey: "base", ...extra });
const simulation = dps => ({ dps, dpsError: 0.1, confidence: 95, iterations: 750, engine: "SimulationCraft synthetic-review-fixes" });
const common = (options, extra = {}) => ({ searchId: "synthetic-review", budgetCopper: 1000, options,
  selectedSlots: [...new Set(options.map(item => item.candidate.slotType))], loadout: [], specId: 72,
  market: { sourceUpdatedAt: new Date().toISOString() }, signal: new AbortController().signal,
  simulate: async selections => simulation(1000 + selections.length * 100), maxNewSimulations: 1000, ...extra });

// Preparing an unchanged item does not abort the entire market search. Exact
// replacement data is still submitted; no baseline result is invented for it.
const same = option(1, "CHEST", 100);
const better = option(2, "CHEST", 101);
const loadout = [{ slotType: "CHEST", itemId: 100, inventoryType: 5, itemSubclassId: 4 }];
const equipment = { equipped_items: [{ slot: { type: "CHEST" }, item: { id: 100 }, bonus_list: [],
  enchantments: [{ enchantment_id: 123 }], sockets: [{ item: { id: 456 } }] }] };
const originalEquipment = structuredClone(equipment);
let identicalPrepared = false;
const identicalSearch = await searchAuctionGearOptions(common([same, better], { loadout,
  simulate: async selections => {
    const prepared = prepareGearLoadout({ selections, equipment, loadout, specId: 72 });
    if (selections[0]?.candidate.itemId === 100) {
      identicalPrepared = true;
      assert.deepEqual(prepared.changes, [{ slot: "chest", itemId: 100, bonusIds: [] }]);
    }
    return simulation(selections[0]?.candidate.itemId === 101 ? 1100 : 1000);
  } }));
assert(identicalPrepared);
assert.equal(identicalSearch.result.searchComplete, true);
assert.equal(identicalSearch.result.items.find(item => item.itemId === 101).evaluation, "upgrade");
assert.equal(identicalSearch.result.items.find(item => item.itemId === 100).comparison.deltaDps, 0);
assert.deepEqual(equipment, originalEquipment);
await assert.rejects(searchAuctionGearOptions(common([same], { simulate: async () => { throw new Error("simulation_unavailable"); } })), /simulation_unavailable/);

// Equal native effects and equal equip constraints are evaluated once per slot
// combination, while every financial offer remains eligible for procurement.
const fourSlots = ["HEAD", "CHEST", "WRIST", "FEET"];
const duplicateLots = fourSlots.flatMap((slot, index) => Array.from({ length: 10 }, (_, lot) =>
  option(1000 + index * 10 + lot, slot, 2000 + index, { costCopper: 10 + lot })));
let effects = 0;
const compressed = await assembleAuctionGear(common(duplicateLots, {
  simulate: async selections => { effects++; return simulation(1000 + selections.length * 100); } }));
assert.equal(compressed.result.combinationKind, "effects");
assert.equal(compressed.result.combinationCount, "16");
assert.equal(compressed.result.combinationsChecked, 16);
assert.equal(compressed.result.validCombinations, 16);
assert.equal(effects, 16);
assert.equal(compressed.result.spentCopper, 40);
assert.equal(compressed.result.purchases.length, 4);

// The cheapest individual lot is not necessarily the cheapest two-ring buy.
const shared = ["FINGER_1", "FINGER_2"].flatMap(slot => [
  option(3001, slot, 3000, { costCopper: 20 }),
  option(3002, slot, 3000, { costCopper: 30, quantity: 2 }),
]);
const sharedResult = await assembleAuctionGear(common(shared, { budgetCopper: 30 }));
assert.equal(sharedResult.result.purchases.length, 2);
assert(sharedResult.result.purchases.every(item => item.auctionId === 3002));
assert.equal(sharedResult.result.spentCopper, 30);
assert.equal(sharedResult.result.combinationCount, "4");
const excludedShared = shared.filter(item => !(item.auctionId === 3002 && item.candidate.slotType === "FINGER_2"));
const excludedResult = await assembleAuctionGear(common(excludedShared, { budgetCopper: 30 }));
assert.equal(excludedResult.result.purchases.length, 1, "an excluded slot alias must not be silently restored");

// Grouping may never merge different unique/category/set constraints merely
// because their native input identity is equal.
const constraintOptions = [option(4001, "FINGER_2", 4000, {
  candidate: candidate("FINGER_2", 4000, { limitCategoryId: 9, limitQuantity: 1 }) }),
option(4002, "FINGER_2", 4000, { candidate: candidate("FINGER_2", 4000, { limitCategoryId: 10, limitQuantity: 1 }) })];
assert.equal(auctionEffectGroups(constraintOptions, ["FINGER_2"])[0].length, 2);
const constraints = await assembleAuctionGear(common(constraintOptions, {
  loadout: [{ slotType: "FINGER_1", itemId: 4003, inventoryType: 11, itemSubclassId: 0, limitCategoryId: 9, limitQuantity: 1 }] }));
assert.equal(constraints.result.purchases[0].auctionId, 4002);

// An independent financial oracle enumerates real lot assignments for small
// pools. It knows nothing about effect grouping, components, or subset DP.
const key = options => options.map(item => item.id).sort().join("|");
function oracle(groups, budgetCopper) {
  let best = null;
  const walk = (index, selections) => {
    if (index < groups.length) { for (const item of groups[index].options) walk(index + 1, [...selections, item]); return; }
    let costCopper; try { costCopper = auctionPlanCost(selections); } catch { return; }
    if (costCopper > budgetCopper) return;
    if (!best || costCopper < best.costCopper || costCopper === best.costCopper && key(selections) < key(best.options)) best = { options: selections, costCopper };
  };
  walk(0, []);
  return best;
}
let seed = 12345;
const random = bound => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) % bound; };
let oracleCases = 0;
for (let attempt = 0; attempt < 40; attempt++) {
  const slots = ["FINGER_1", "FINGER_2", "MAIN_HAND", "OFF_HAND"];
  const offers = [slots.slice(0, 2), slots.slice(2)].flatMap((pair, pairIndex) => Array.from({ length: 4 }, (_, index) => {
    const auctionId = 5000 + pairIndex * 10 + index, costCopper = 1 + random(15), quantity = 1 + random(2);
    return pair.flatMap(slot => random(4) ? [option(auctionId, slot, 6000 + pairIndex, { costCopper, quantity })] : []);
  }).flat());
  const groups = auctionEffectGroups(offers, slots);
  if (groups.some(group => !group.length)) continue;
  const selected = groups.map(group => { assert.equal(group.length, 1); return group[0]; });
  const budgetCopper = 5 + random(35);
  const expected = oracle(selected, budgetCopper);
  const actual = await cheapestAuctionEffectSelection(selected, budgetCopper, new AbortController().signal);
  oracleCases++;
  assert.equal(actual?.costCopper ?? null, expected?.costCopper ?? null, `oracle_cost:${attempt}`);
  assert.equal(actual ? key(actual.options) : null, expected ? key(expected.options) : null, `oracle_lots:${attempt}`);
}
assert(oracleCases >= 35);

// Repair and useful pairs are evaluated before the long exact traversal, even
// with no positive single and sixteen selected slots. Partial is never maximum.
const allSlots = ["HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "WRIST", "HANDS", "WAIST", "LEGS", "FEET",
  "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2", "MAIN_HAND", "OFF_HAND"];
const pairOptions = allSlots.map((slot, index) => option(7000 + index, slot));
const pairInput = common(pairOptions, { simulate: async selections => simulation(selections.some(item => item.candidate.slotType === "HEAD") &&
  selections.some(item => item.candidate.slotType === "NECK") ? 1200 : selections.length === 1 &&
    ["HEAD", "NECK"].includes(selections[0].candidate.slotType) ? 999 : selections.length ? 990 : 1000) });
const pairSearch = await searchAuctionGearOptions(pairInput);
assert(pairSearch.result.items.every(item => item.evaluation === "not_upgrade"));
const earlyPair = await assembleAuctionGear({ ...pairInput, maxNewSimulations: 1,
  baseline: pairSearch.result.baseline, simulationCache: pairSearch.checkpoint.simulationCache });
assert.equal(earlyPair.result.comparison.deltaDps, 200);
assert.equal(earlyPair.result.exhaustiveComplete, false);
assert.equal(earlyPair.result.searchLimited, true);
assert.equal(earlyPair.result.simulations, 1);
await assert.rejects(assembleAuctionGear({ ...pairInput, checkpoint: { ...earlyPair.checkpoint, version: 1 } }), /auction_search_changed/);
await assert.rejects(assembleAuctionGear({ ...pairInput, checkpoint: earlyPair.checkpoint, budgetCopper: 999 }), /auction_search_changed/);

const repairOptions = [option(8001, "FINGER_1", 8001, { candidate: candidate("FINGER_1", 8001, { limitCategoryId: 10, limitQuantity: 1 }) }),
  option(8002, "FINGER_2", 8002, { candidate: candidate("FINGER_2", 8002, { limitCategoryId: 9, limitQuantity: 1 }) })];
const repairBase = [{ slotType: "FINGER_1", itemId: 1, inventoryType: 11, itemSubclassId: 0, limitCategoryId: 9, limitQuantity: 1 },
  { slotType: "FINGER_2", itemId: 2, inventoryType: 11, itemSubclassId: 0, limitCategoryId: 10, limitQuantity: 1 }];
const repairInput = common(repairOptions, { loadout: repairBase });
const repairSearch = await searchAuctionGearOptions(repairInput);
assert(repairSearch.result.items.every(item => item.evaluation === "requires_combination"));
const repair = await assembleAuctionGear({ ...repairInput, baseline: repairSearch.result.baseline,
  simulationCache: repairSearch.checkpoint.simulationCache, maxNewSimulations: 1 });
assert.equal(repair.result.comparison.deltaDps, 200);
assert.equal(repair.result.purchases.length, 2);

// A large catalog cannot create a quadratic warmup before honoring a chunk
// yield/cancellation. This does not cap the discovered or exact-search pool.
const large = Array.from({ length: 5000 }, (_, index) => option(10000 + index, "HEAD"));
const started = performance.now();
const yielded = await assembleAuctionGear(common(large, { baseline: simulation(1000), shouldYield: () => true,
  simulate: async () => { throw new Error("Unexpected native call after requested yield"); } }));
assert.equal(yielded.result.optionsConsidered, 5000);
assert.equal(yielded.result.combinationCount, "5001");
assert.equal(yielded.result.exhaustiveComplete, false);
assert.equal(yielded.result.simulations, 0);
assert(performance.now() - started < 5000, "large_effect_pool_ignored_chunk_yield");
const aborter = new AbortController();
setImmediate(() => aborter.abort());
await assert.rejects(assembleAuctionGear(common(large, { baseline: simulation(1000), signal: aborter.signal })), /abort/i);

console.log(`Auction review fixes passed: exact worn-item replacement, service errors preserved, 14641→16 effect states, shared-lot quantity/exclusions, separate constraints, ${oracleCases} independent procurement oracle cases, early nonlinear and repair pairs, partial results, checkpoint drift and 5000-effect yield/cancellation (synthetic offline only).`);
