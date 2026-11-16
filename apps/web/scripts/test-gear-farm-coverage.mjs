import assert from "node:assert/strict";
import { farmCoverageMessage, farmCoverageState } from "../lib/wow/gearFarm/coverage.ts";

// Synthetic coverage facts; never used as live character or loot data.
const result = {
  activities: [{ variantsUnverified: 0, targets: [{ verification: "not_upgrade" }] }],
  coverage: { simulations: 2, searchLimited: false },
};
assert.equal(farmCoverageState(result), "complete");
assert.equal(farmCoverageMessage(result, "ru"), null);
assert.equal(farmCoverageState({ ...result, coverage: { ...result.coverage, searchLimited: true } }), "partial");
assert.equal(farmCoverageState({ ...result, coverage: { ...result.coverage, unsupportedSources: ["raid"] } }), "partial");
for (const simulations of [0, 1]) {
  const unmeasured = { ...result, coverage: { simulations, searchLimited: false } };
  assert.equal(farmCoverageState(unmeasured), "unverified");
  assert.match(farmCoverageMessage(unmeasured, "ru"), /Недостаточно/);
  assert.match(farmCoverageMessage(unmeasured, "en"), /Not enough/);
}
for (const verification of ["scaling_unverified", "variant_verified", "item_level"]) {
  assert.equal(farmCoverageState({ ...result, activities: [{ variantsUnverified: 0, targets: [{ verification }] }] }), "partial");
}
assert.equal(farmCoverageState({ ...result, activities: [{ variantsUnverified: 1, targets: [] }] }), "partial");
// Confirmed upgrades do not hide incomplete coverage elsewhere.
const partial = { ...result, activities: [{ variantsUnverified: 2, targets: [{ verification: "simulated" }] }] };
assert.equal(farmCoverageState(partial), "partial");
assert.match(farmCoverageMessage(partial, "ru"), /часть/);
assert.match(farmCoverageMessage(partial, "en"), /part/);
console.log("Gear farm coverage states passed");
