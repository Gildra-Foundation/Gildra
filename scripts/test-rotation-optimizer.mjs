import assert from "node:assert/strict";
import { generateAplCandidates, meaningfulDpsGain, verificationTolerance } from "../lib/platform/rotation/aplOptimizer.ts";

const rules = [
  { id: "rule-rampage", abilityId: "rampage", source: "maintained", conditions: [{ type: "resource", resource: "rage", operator: "gte", value: 80 }] },
  { id: "rule-bloodthirst", abilityId: "bloodthirst", source: "maintained", conditions: [{ type: "buff", aura: "enrage", state: "down" }] },
  { id: "rule-execute", abilityId: "execute", source: "maintained", conditions: [{ type: "execute", operator: "lte", value: 20 }] },
  { id: "rule-whirlwind", abilityId: "whirlwind", source: "maintained", conditions: [{ type: "targets", operator: "gte", value: 3 }] },
];
const options = { resources: ["rage"], buffs: ["enrage"], cooldowns: rules.map((rule) => rule.abilityId) };
const first = generateAplCandidates({ aplRules: rules, scenario: "aoe", targets: 5, allowedAbilities: rules.map((rule) => rule.abilityId), options, limit: 12 });
const repeated = generateAplCandidates({ aplRules: rules, scenario: "aoe", targets: 5, allowedAbilities: rules.map((rule) => rule.abilityId), options, limit: 12 });
assert.deepEqual(first, repeated, "search space must be deterministic");
assert.equal(first.candidates[0].id, "baseline");
assert(first.candidates.some((entry) => entry.mutation === "priority"));
assert(first.candidates.some((entry) => entry.mutation === "threshold"));
assert(first.candidates.some((entry) => entry.mutation === "state"));
assert(first.candidates.length <= 12);
assert.equal(new Set(first.candidates.map((entry) => JSON.stringify(entry.aplRules))).size, first.candidates.length);
assert.equal(verificationTolerance(100000, 20, 100050, 20).stable, true);
assert.equal(verificationTolerance(100000, 20, 101000, 20).stable, false);
assert.equal(meaningfulDpsGain(100000, 100, 100050, 100).meaningful, false);
assert.equal(meaningfulDpsGain(100000, 100, 101000, 100).meaningful, true);
console.log(JSON.stringify({ status: "passed", candidates: first.candidates.length, considered: first.considered, mutations: [...new Set(first.candidates.map((entry) => entry.mutation))], deterministic: true, verification: true }, null, 2));
