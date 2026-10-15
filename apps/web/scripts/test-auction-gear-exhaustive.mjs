import assert from "node:assert/strict";
import { assembleAuctionGear, auctionPlanCost, auctionPlanLoadout, auctionSelectionEffectKey, searchAuctionGearOptions } from "../lib/wow/auctionGearPlanner.ts";

function candidate(slot, itemId, extra = {}) {
  return { entityId: `entity-${itemId}`, itemId, name: `Item ${itemId}`, slotType: slot,
    itemLevel: 139, inventoryType: slot.startsWith("FINGER") ? 11 : 5, itemClassId: 4, itemSubclassId: 4,
    season: { id: "s", patch: "p", status: "current", evidence: "test" }, source: { type: "auction", evidence: "auction" },
    constraints: { uniqueEquipped: false, crafted: false, allowableClassMask: "0", requiredLevel: 78 },
    compatibility: { specId: 72, method: "specialization", itemClassId: 4, itemSubclassId: 4 },
    provenance: { buildId: 1 }, eligible: true, rejectionReasons: [],
    variants: [{ key: "base", itemLevel: 139, contextId: 0, bonusIds: [] }], ...extra };
}
const option = (id, slot, cost = 1, extra = {}) => ({ id: `${id}:${slot}`, auctionId: id, quantity: 1,
  costCopper: cost, candidate: candidate(slot, id), variantKey: "base", ...extra });
const simulation = (dps, dpsError = 0.1) => ({ dps, dpsError, confidence: 95, iterations: 750, engine: "SimulationCraft exhaustive-test" });
const common = (options, extra = {}) => ({ searchId: "server-owned-search", budgetCopper: 100, options,
  selectedSlots: [...new Set(options.map(o => o.candidate.slotType))], loadout: [], specId: 72,
  market: { sourceUpdatedAt: new Date().toUTCString() }, signal: new AbortController().signal,
  simulate: async selections => simulation(1000 + selections.length * 100), ...extra });

// The old shortlist silently dropped options beyond 28; all lots must remain visible.
const forty = Array.from({ length: 40 }, (_, i) => option(i + 1, "HEAD"));
const search = await searchAuctionGearOptions(common(forty, { maxNewSimulations: 100,
  simulate: async selections => simulation(1000 + (selections[0]?.auctionId ?? 0)) }));
assert.equal(search.result.items.length, 40);
assert.equal(search.result.searchComplete, true);
assert.equal(search.result.items.find(i => i.auctionId === 40)?.evaluation, "upgrade");
const beyondOldCap = await assembleAuctionGear(common(forty, { maxNewSimulations: 100,
  simulate: async selections => simulation(1000 + (selections[0]?.auctionId ?? 0)) }));
assert.equal(beyondOldCap.result.exhaustiveComplete, true);
assert.equal(beyondOldCap.result.purchases[0].auctionId, 40);

// A black-box ten-piece synergy cannot be discovered by summing singles or an eight-depth beam.
const slots = ["HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "WRIST", "HANDS", "WAIST", "LEGS", "FEET"];
const synergy = await assembleAuctionGear(common(slots.map((slot, i) => option(i + 100, slot)), {
  maxNewSimulations: 2000, simulate: async selections => simulation(selections.length === 10 ? 2000 : selections.length ? 900 : 1000),
}));
assert.equal(synergy.result.purchases.length, 10);
assert.equal(synergy.result.comparison.candidateDps, 2000);
assert.equal(synergy.result.exhaustiveComplete, true);
assert.equal(synergy.result.combinationCount, "1024");
assert.equal(synergy.result.validCombinations, 1024);

// A deterministic serialized cursor resumes without skipping or repeating a native effect.
const resumeOptions = [option(201, "HEAD"), option(202, "CHEST"), option(203, "FEET")];
const nativeKeys = new Set();
let checkpoint, resumed, chunks = 0;
do {
  resumed = await assembleAuctionGear(common(resumeOptions, { checkpoint, maxNewSimulations: 1,
    simulate: async selections => { const key = auctionSelectionEffectKey(selections); assert(!nativeKeys.has(key)); nativeKeys.add(key); return simulation(1000 + selections.length * 100); } }));
  checkpoint = JSON.parse(JSON.stringify(resumed.checkpoint));
  chunks++;
} while (!resumed.result.exhaustiveComplete && chunks < 20);
assert.equal(resumed.result.exhaustiveComplete, true);
assert.equal(resumed.result.purchases.length, 3);
assert.equal(nativeKeys.size, 8);
assert(chunks > 1);
await assert.rejects(assembleAuctionGear(common(resumeOptions, { checkpoint, budgetCopper: 99 })), /auction_search_changed/);

// Unique categories can conflict in both singles and become legal after both replacements.
const uniqueOptions = [option(301, "FINGER_1", 10, { candidate: candidate("FINGER_1", 301, { constraints: { limitCategoryId: 10, limitQuantity: 1 } }) }),
  option(302, "FINGER_2", 10, { candidate: candidate("FINGER_2", 302, { constraints: { limitCategoryId: 9, limitQuantity: 1 } }) })];
const uniqueBase = [{ slotType: "FINGER_1", itemId: 1, inventoryType: 11, itemSubclassId: 0, limitCategoryId: 9, limitQuantity: 1 },
  { slotType: "FINGER_2", itemId: 2, inventoryType: 11, itemSubclassId: 0, limitCategoryId: 10, limitQuantity: 1 }];
const uniqueSearch = await searchAuctionGearOptions(common(uniqueOptions, { loadout: uniqueBase }));
assert(uniqueSearch.result.items.every(item => item.evaluation === "requires_combination" && item.comparison === null));
const uniqueAssembly = await assembleAuctionGear(common(uniqueOptions, { loadout: uniqueBase, simulationCache: uniqueSearch.checkpoint.simulationCache,
  baseline: uniqueSearch.result.baseline, simulate: async selections => { auctionPlanLoadout(uniqueBase, selections, 72); return simulation(1000 + selections.length * 100); } }));
assert.equal(uniqueAssembly.result.purchases.length, 2);
assert.equal(uniqueAssembly.result.validCombinations, 2);

// Keeping only the cheapest equal-effect lot would lose the best affordable two-ring purchase.
const lots = [1, 2].flatMap(lot => ["FINGER_1", "FINGER_2"].map(slot => option(lot + 400, slot, lot === 1 ? 20 : 30,
  { quantity: lot, candidate: candidate(slot, 999) })));
let lotNativeCalls = 0;
const joint = await assembleAuctionGear(common(lots, { budgetCopper: 30, simulate: async selections => { lotNativeCalls++; return simulation(1000 + selections.length * 100); } }));
assert.equal(joint.result.purchases.length, 2);
assert.equal(joint.result.spentCopper, 30);
assert(joint.result.purchases.every(p => p.auctionId === 402));
assert.equal(lotNativeCalls, 4); // baseline, either single slot, both slots; lot prices share effects.
assert.throws(() => auctionPlanCost([lots[0], { ...lots[1], candidate: candidate("FINGER_2", 998) }]), /invalid_auction_selection/);

// A non-Fury 2H cannot silently remove an unselected equipped offhand.
const weapons = [{ slotType: "MAIN_HAND", itemId: 1, inventoryType: 13, itemSubclassId: 7 },
  { slotType: "OFF_HAND", itemId: 2, inventoryType: 23, itemSubclassId: 0 }];
const staff = option(501, "MAIN_HAND", 10, { candidate: candidate("MAIN_HAND", 501,
  { inventoryType: 17, itemClassId: 2, itemSubclassId: 10, compatibility: { specId: 63, method: "specialization" } }) });
const locked = await assembleAuctionGear(common([staff], { specId: 63, loadout: weapons, selectedSlots: ["MAIN_HAND"] }));
assert.deepEqual(locked.result.purchases, []);
assert.deepEqual(locked.result.removedSlots, []);
const unlocked = await assembleAuctionGear(common([staff], { specId: 63, loadout: weapons, selectedSlots: ["MAIN_HAND", "OFF_HAND"] }));
assert.equal(unlocked.result.purchases.length, 1);
assert.deepEqual(unlocked.result.removedSlots, ["OFF_HAND"]);

// Maximum measured DPS and confidence are separate; a noisy higher result must not be hidden.
const noisy = await assembleAuctionGear(common([option(601, "HEAD")], { simulate: async selections => simulation(selections.length ? 1100 : 1000, 100) }));
assert.equal(noisy.result.comparison.candidateDps, 1100);
assert.equal(noisy.result.comparison.uncertainty.significant, false);
assert.equal(noisy.result.exhaustiveComplete, true);

// Warm start uses all cached legal singles even when the first chunk yields immediately.
const seeded = await assembleAuctionGear(common(forty, { baseline: search.result.baseline,
  simulationCache: search.checkpoint.simulationCache, shouldYield: () => true }));
assert.equal(seeded.result.purchases[0].auctionId, 40);
assert.equal(seeded.result.exhaustiveComplete, false);
assert.equal(seeded.result.simulations, 0);

// Cached source drift cannot mix engines, and a chunk-boundary snapshot is JSON serializable.
const mixed = structuredClone(search.checkpoint.simulationCache);
mixed[auctionSelectionEffectKey([forty[0]])].engine = "SimulationCraft changed";
await assert.rejects(assembleAuctionGear(common(forty, { simulationCache: mixed })), /simulation_version_changed/);
const interrupted = await assembleAuctionGear(common(resumeOptions, { maxNewSimulations: 2 }));
assert.equal(interrupted.result.exhaustiveComplete, false);
assert.doesNotThrow(() => JSON.stringify(interrupted.checkpoint));

// A completed native result is saved before a later cancellation interrupts traversal.
const aborter = new AbortController();
let saved;
await assert.rejects(assembleAuctionGear(common(resumeOptions, { signal: aborter.signal,
  onCheckpoint: state => { saved = state; }, simulate: async selections => { if (selections.length) aborter.abort(); return simulation(1000 + selections.length * 100); } })), /abort/i);
assert(saved.simulations >= 2);
assert(saved.best.optionIds.length > 0);
const afterCancellation = await assembleAuctionGear(common(resumeOptions, { checkpoint: JSON.parse(JSON.stringify(saved)), maxNewSimulations: 100 }));
assert.equal(afterCancellation.result.exhaustiveComplete, true);

// Even an entirely cached traversal yields so a user cancellation can be delivered.
const cachedAborter = new AbortController();
let cachedCheckpoint;
setImmediate(() => cachedAborter.abort());
await assert.rejects(assembleAuctionGear(common(slots.map((slot, i) => option(i + 100, slot)), {
  signal: cachedAborter.signal, simulationCache: synergy.checkpoint.simulationCache,
  onCheckpoint: state => { cachedCheckpoint = state; }, simulate: async () => { throw new Error("Unexpected native call"); },
})), /abort/i);
assert(cachedCheckpoint.combinationsChecked >= 256 && cachedCheckpoint.combinationsChecked < 1024);

console.log("Exact auction search checks passed: complete pools, ten-slot synergy, resumable cursors, repaired unique pairs, shared-lot cost/quantity, effect memoization, locked slots, uncertainty, warm start, source drift and cancellation.");
