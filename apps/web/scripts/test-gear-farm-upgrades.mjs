import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { confirmFarmImprovements } from "../lib/wow/gearFarm/confirmation.ts";
import { confirmedFarmActivities, isConfirmedFarmUpgrade } from "../lib/wow/gearFarm/recommendations.ts";
import { farmCandidate, sourceTargets, sortFarmActivities } from "../lib/wow/gearFarm/planner.ts";
import { independentlyMatchesStats } from "../lib/wow/gearFarm/rewards.ts";
// Synthetic exact rewards exercise selection/uncertainty, never live loot claims.
const engine = "SimulationCraft farm-regression";
const activity = { id: "dungeon", name: "Synthetic dungeon", access: "level_condition_met", targets: [] };
const context = { classId: 1, specId: 72, characterLevel: 81, raceId: 10, faction: "HORDE", anchorItemClassId: -1, anchorItemSubclassId: -1,
  season: { id: "midnight-season-2", patch: "12.1", expansionId: 11, sourceUrl: "https://example.invalid", activityNames: [activity.name] } };
const entity = { id: "proc", externalId: 999001, name: "Synthetic proc", payload: {}, tooltip: { blocks: [
  { type: "item_registry", class_id: 4, subclass_id: 0, inventory_type: "TRINKET" },
  { type: "item_requirements", class_mask: "-1", race_mask_0: "-1", race_mask_1: "-1", required_level: 78 },
  { type: "item_variants", entries: [{ key: "base", item_level: 139, context_id: 17, bonus_list_ids: [100], modifiers: [], stats: [] }] },
] } };
const source = { id: 1, name: "Synthetic boss", location: activity.name };
const discovered = sourceTargets({ loot: [{ entity, encounterId: 1, encounterName: source.name, difficultyMask: -1 }], activity,
  equipment: [{ slotType: "TRINKET_1", itemId: 99, itemLevel: 200 }], loadout: [], context });
assert.equal(discovered.length, 1, "Proc-only lower-level trinkets must reach exact reward checks");
assert.equal(discovered[0].verification, "scaling_unverified");
const metadata = { itemClassId: 4, itemSubclassId: 0, inventoryType: 12, itemLevel: 139, quality: 3, stats: {} };
assert(independentlyMatchesStats(entity, metadata));
assert(!independentlyMatchesStats(entity, { ...metadata, stats: { strength: 1 } }));
const missingStats = structuredClone(entity); delete missingStats.tooltip.blocks[2].entries[0].stats;
assert(!independentlyMatchesStats(missingStats, metadata), "Missing stats are not statless proof");
const unknownAllocation = structuredClone(entity); unknownAllocation.tooltip.blocks[2].entries[0].stats = [{ type: 32, value: 10 }];
assert(!independentlyMatchesStats(unknownAllocation, metadata));
function option(index, itemLevel = 139) {
  const candidate = farmCandidate(entity, { ...context, slotType: "TRINKET_1", currentItemLevel: 200 }, source, []);
  assert(candidate); candidate.itemId = 999001 + index; candidate.itemLevel = itemLevel;
  candidate.variants = [{ key: `exact-${index}`, itemLevel, bonusIds: [100], contextId: 17, modifiers: [], resolution: { engine, requiredLevel: 78, stats: {} } }];
  return { activityId: activity.id, candidate, variantKey: `exact-${index}`,
    target: { ...discovered[0], itemId: candidate.itemId, itemLevel, requiredLevel: 78, verification: "variant_verified" } };
}
const measurement = dps => ({ dps, dpsError: 10, confidence: 95, iterations: 750, engine });
const input = { activities: [activity], equipment: { equipped_items: [{ item: { id: 99 }, slot: { type: "TRINKET_1" } }] },
  loadout: [{ itemId: 99, slotType: "TRINKET_1", inventoryType: 12, itemSubclassId: 0 }], specId: 72, characterLevel: 81, signal: AbortSignal.timeout(30_000) };
const options = Array.from({ length: 30 }, (_, i) => option(i, i === 29 ? 100 : 250));
let calls = 0;
const simulate = async prepared => {
  calls++; assert(prepared.changes.length <= 1);
  const id = prepared.changes[0]?.itemId;
  return measurement(id === undefined ? 10000 : id === 999030 ? 11000 : id === 999002 ? 10001 : 9900);
};
const result = await confirmFarmImprovements({ ...input, options, simulate });
assert.equal(calls, 31, "The best item beyond the old 24-item cap must be checked");
assert.equal(result.searchLimited, false); assert.equal(result.baselineDps, 10000);
assert.deepEqual(options.filter(o => isConfirmedFarmUpgrade(o.target)).map(o => o.target.itemId), [999030]);
assert.equal(options[1].target.verification, "not_upgrade", "Positive noise is not an upgrade");
assert.equal(input.equipment.equipped_items[0].item.id, 99);
const bounded = await confirmFarmImprovements({ ...input, options: Array.from({ length: 30 }, (_, i) => option(i)), simulate, limit: 24 });
assert.equal(bounded.searchLimited, true);
await assert.rejects(confirmFarmImprovements({ ...input, options: [option(1)], simulate, limit: NaN }), /invalid_simulation_limit/);
for (const field of [{ dps: 0 }, { dps: -1 }, { dps: Infinity }, { iterations: 0 }, { iterations: 1.5 }, { dpsError: -1 }, { confidence: 90 }]) {
  await assert.rejects(confirmFarmImprovements({ ...input, options: [option(1)], simulate: async () => ({ ...measurement(10000), ...field }) }), /invalid_simulation_result/);
  let stage = 0;
  await assert.rejects(confirmFarmImprovements({ ...input, options: [option(1)], simulate: async () => ({ ...measurement(11000), ...(stage++ ? field : {}) }) }), /invalid_simulation_result/);
}
const good = options[29].target;
for (const bad of [{ verification: "item_level" }, { verification: "variant_verified" }, { verification: "scaling_unverified" }, { verification: "not_upgrade" },
  { deltaDps: -1 }, { deltaPercent: 0 }, { deltaPercent: NaN }, { marginPercent: undefined }, { marginPercent: -1 }, { marginPercent: good.deltaPercent }, { marginPercent: Infinity }]) assert(!isConfirmedFarmUpgrade({ ...good, ...bad }));
const activities = [{ ...activity, targets: options.map(o => o.target) }, { ...activity, id: "unknown-access", access: "unlock_unverified", targets: [good] },
  { ...activity, id: "bad", targets: [{ ...good, verification: "item_level" }] }];
const recommended = confirmedFarmActivities(activities);
assert.equal(recommended.length, 1); assert.deepEqual(recommended[0].targets, [good]);
assert.equal(activities[0].targets.length, 30, "Keep non-upgrade evidence for coverage");
assert.equal(sortFarmActivities([activities[2], activities[0]])[0].id, activity.id);
// Optional replay: genuine offline SimC measurements from public reference and
// artificial controls. This is not proof that these are obtainable farm drops.
if (process.env.GILDRA_FARM_EFFECTS_REPORT) {
  const report = JSON.parse(readFileSync(process.env.GILDRA_FARM_EFFECTS_REPORT, "utf8")); assert.equal(report.status, "verified");
  for (const control of ["active-stat-control", "passive-stat-control"]) {
    const replacement = option(50); replacement.candidate.variants[0].resolution.engine = report.engine;
    const confirmed = await confirmFarmImprovements({ ...input, options: [replacement], simulate: async prepared => report.measurements[prepared.changes.length ? "native" : control] });
    assert.equal(confirmed.engine, report.engine); assert(isConfirmedFarmUpgrade(replacement.target), `${control}: effect earns a significant upgrade`);
  }
}
console.log(JSON.stringify({ status: "passed", checks: ["proc-only candidates", "explicit statless proof", "all 30 rewards checked", "lower-ilvl winner", "noise/downgrade excluded", "partial budgets", "invalid measurements", "access and recommendation gates", "coverage evidence retained"], realEffectsReplay: Boolean(process.env.GILDRA_FARM_EFFECTS_REPORT) }));
