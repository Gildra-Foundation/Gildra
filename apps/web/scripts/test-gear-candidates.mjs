import assert from "node:assert/strict";
import { buildGearCandidatePool, gearCandidateCatalogQuery, validateGearCandidateRelations } from "../lib/wow/gearCandidates.ts";

const context = {
  classId: 1, specId: 72, characterLevel: 90, slotType: "CHEST", currentItemLevel: 290,
  anchorItemClassId: 4, anchorItemSubclassId: 4,
  season: { id: "midnight-season-2", patch: "12.1", expansionId: 11, build: "12.1.0.69814", sourceUrl: "https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live", activityNames: ["The Venomous Abyss", "Отравленная бездна"] },
};

const item = (overrides = {}) => ({
  id: crypto.randomUUID(), externalId: 280001, name: "Season plate chest", quality: 4, buildId: 69814,
  payload: { db2: { ExpansionID: "11", BaseItemLevel: "300", ItemSet: "991", LimitCategory: "44", LimitCategoryQuantity: "1" } },
  tooltip: { blocks: [
    { type: "item_registry", class_id: 4, subclass_id: 4, inventory_type: "5" },
    { type: "item_requirements", class_mask: "1", required_level: 90 },
    { type: "item_set", set_id: 991, name: "Warrior season set" },
    { type: "unique_equipped" },
    { type: "acquisition", source_type: "encounter", source_id: 6001, name: "Boss", location: "The Venomous Abyss", difficulty_mask: 16 },
    { type: "provenance", build: "12.1.0.69814", build_number: 69814, source_url: "https://wago.tools/db2/ItemSparse/csv?build=12.1.0.69814&locale=enUS" },
    { type: "item_variants", entries: [{ key: "raid-mythic", context_id: 16, bonus_list_ids: [12040, 12345], item_level: 300, upgrade_track_id: 6, upgrade_rank: 1, source_artifact_id: "artifact-1" }] },
  ] },
  ...overrides,
});

const eligible = item();
const wrongArmor = item({ externalId: 280002, name: "Cloth chest", tooltip: { blocks: [
  { type: "item_registry", class_id: 4, subclass_id: 1, inventory_type: "5" },
  { type: "item_requirements", class_mask: "0", required_level: 90 },
  { type: "acquisition", source_type: "encounter", location: "The Venomous Abyss" },
] } });
const legacy = item({ externalId: 280003, name: "Legacy plate", payload: { db2: { ExpansionID: "10", BaseItemLevel: "310" } } });
const unknownSource = item({ externalId: 280004, name: "Unknown plate", tooltip: { blocks: eligible.tooltip.blocks.filter((block) => block.type !== "acquisition") } });
const crafted = item({ externalId: 280005, name: "Crafted plate", tooltip: { blocks: eligible.tooltip.blocks.map((block) => block.type === "acquisition" ? { type: "acquisition", source_type: "crafting_recipe", source_id: 7001, name: "Midnight Smithing" } : block) } });

const pool = buildGearCandidatePool([wrongArmor, legacy, unknownSource, crafted, eligible], context);
assert.deepEqual(pool.candidates.map((candidate) => candidate.itemId), [280005, 280001]);
assert.equal(pool.candidates[1].constraints.uniqueEquipped, true);
assert.equal(pool.candidates[1].constraints.setId, 991);
assert.equal(pool.candidates[1].constraints.limitCategoryId, 44);
assert.equal(pool.candidates[0].constraints.crafted, true);
assert.equal(pool.candidates[0].season.status, "current");
assert.deepEqual(pool.candidates[1].variants[0].bonusIds, [12040, 12345]);
assert.deepEqual(pool.candidates[0].compatibility, { specId: 72, method: "equipped-anchor", itemClassId: 4, itemSubclassId: 4 });
assert.equal(pool.rejected.find((candidate) => candidate.itemId === 280002)?.rejectionReasons.includes("item_subclass_mismatch"), true);
assert.equal(pool.rejected.find((candidate) => candidate.itemId === 280003)?.rejectionReasons.includes("legacy_season"), true);
assert.equal(pool.rejected.find((candidate) => candidate.itemId === 280004)?.rejectionReasons.includes("acquisition_source_missing"), true);
assert.equal(pool.candidates.every((candidate) => candidate.provenance.build === "12.1.0.69814"), true);
assert.deepEqual(gearCandidateCatalogQuery("CHEST", 290), { locale: "ru_RU", product: "wow", type: "item", category: "equipment/slots/chest", minItemLevel: 290, limit: 100, includeTotal: false, fresh: true });
assert.throws(() => gearCandidateCatalogQuery("UNKNOWN", 290), /unsupported_equipment_slot/);
assert.deepEqual(validateGearCandidateRelations(pool.candidates, context), { valid: true, errors: [] });
assert.equal(validateGearCandidateRelations([...pool.candidates, pool.candidates[0]], context).errors.some((error) => error.startsWith("duplicate_item:")), true);

console.log(JSON.stringify({ status: "passed", eligible: pool.candidates.map((candidate) => candidate.itemId), rejectedByReason: pool.rejectedByReason, constraints: ["unique-equipped", "crafted", "item-set", "class-mask", "required-level"], catalogQueryContract: true, relationIntegrity: true, deterministic: true }, null, 2));
