import assert from "node:assert/strict";
import { compareGearSimulationResults, gearComparisonFingerprint, prepareGearChange } from "../lib/wow/gearSimulation.ts";

const equipment = { equipped_items: [
  { item: { id: 1001 }, slot: { type: "CHEST" } },
  { item: { id: 1002 }, slot: { type: "MAIN_HAND" } },
  { item: { id: 1003 }, slot: { type: "OFF_HAND" } },
  { item: { id: 1004 }, slot: { type: "TRINKET_1" } },
  { item: { id: 1005 }, slot: { type: "WRIST" } },
] };

function candidate(overrides = {}) {
  return {
    entityId: "candidate", itemId: 2001, name: "Verified candidate", itemLevel: 300,
    slotType: "CHEST", inventoryType: 5, itemClassId: 4, itemSubclassId: 4,
    season: { id: "midnight-season-2", patch: "12.1", status: "current", evidence: "raid" },
    source: { type: "encounter", evidence: "catalog" },
    constraints: { uniqueEquipped: false, crafted: false, allowableClassMask: "1", requiredLevel: 90 },
    compatibility: { specId: 72, method: "equipped-anchor", itemClassId: 4, itemSubclassId: 4 },
    provenance: { build: "12.1.0.69814" }, eligible: true, rejectionReasons: [],
    variants: [{ key: "mythic", itemLevel: 300, bonusIds: [12040, 12345], contextId: 16 }],
    ...overrides,
  };
}

const ordinary = prepareGearChange({ slotType: "CHEST", candidate: candidate(), variantKey: "mythic", equipment });
assert.deepEqual(ordinary, { slot: "chest", itemId: 2001, bonusIds: [12040, 12345] });

const setPiece = prepareGearChange({ slotType: "CHEST", candidate: candidate({ itemId: 2002, constraints: { uniqueEquipped: false, crafted: false, setId: 991, setName: "Season set", allowableClassMask: "1", requiredLevel: 90 } }), variantKey: "mythic", equipment });
assert.equal(setPiece.itemId, 2002, "set item was not preserved as an ordinary verified replacement");

const weapon = candidate({ itemId: 2003, slotType: "MAIN_HAND", inventoryType: 13, itemClassId: 2, itemSubclassId: 7 });
assert.equal(prepareGearChange({ slotType: "MAIN_HAND", candidate: weapon, variantKey: "mythic", customization: { enchantId: 7777 }, equipment }).enchantId, 7777);
assert.throws(() => prepareGearChange({ slotType: "MAIN_HAND", candidate: candidate({ ...weapon, inventoryType: 17 }), variantKey: "mythic", equipment }), /two_hand_requires_offhand_removal/);

const trinket = candidate({ itemId: 2004, slotType: "TRINKET_1", inventoryType: 12, itemClassId: 4, itemSubclassId: 0 });
assert.equal(prepareGearChange({ slotType: "TRINKET_1", candidate: trinket, variantKey: "mythic", equipment }).slot, "trinket1");

const wrist = candidate({ itemId: 2005, slotType: "WRIST", inventoryType: 9 });
assert.deepEqual(prepareGearChange({ slotType: "WRIST", candidate: wrist, variantKey: "mythic", customization: { enchantId: 8888, gemIds: [250001] }, equipment }).gemIds, [250001]);
assert.throws(() => prepareGearChange({ slotType: "TRINKET_1", candidate: trinket, variantKey: "mythic", customization: { gemIds: [250001] }, equipment }), /invalid_gems_for_slot/);
assert.throws(() => prepareGearChange({ slotType: "CHEST", candidate: candidate({ itemId: 1001 }), variantKey: "mythic", equipment }), /candidate_matches_equipped_item/);
assert.throws(() => prepareGearChange({ slotType: "CHEST", candidate: candidate({ eligible: false }), variantKey: "mythic", equipment }), /candidate_slot_mismatch/);
assert.throws(() => prepareGearChange({ slotType: "CHEST", candidate: candidate(), variantKey: "invented", equipment }), /simulation_variant_not_found/);

const fingerprintInput = { profileFingerprint: "armory-fixed", talentLoadout: "loadout", scenario: "single-target", duration: 120, targets: 1, rules: ["rampage"], change: ordinary };
assert.equal(gearComparisonFingerprint(fingerprintInput), gearComparisonFingerprint(structuredClone(fingerprintInput)), "fixed snapshot fingerprint is not repeatable");
assert.notEqual(gearComparisonFingerprint(fingerprintInput), gearComparisonFingerprint({ ...fingerprintInput, change: { ...ordinary, itemId: 9999 } }), "replacement did not affect fingerprint");
const result = compareGearSimulationResults({ dps: 100000, dpsError: 100, confidence: 95 }, { dps: 102000, dpsError: 120, confidence: 95 });
assert.equal(result.deltaDps, 2000);
assert.equal(result.deltaPercent, 2);
assert.equal(result.confidence, 95);
assert.equal(result.uncertainty.significant, true);

console.log(JSON.stringify({ status: "passed", coverage: ["ordinary-item", "set", "weapon", "trinket", "enchant", "socket"], invalidCombinationsBlocked: true, unchangedSnapshotFingerprint: true, absoluteDpsAndDelta: true }, null, 2));
