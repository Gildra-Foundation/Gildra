import { parseAplRule, priorityToAplRules, serializeAplRule, validateAplRules } from "../lib/platform/rotation/apl.ts";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const lines = [
  "actions+=/rampage,if=rage>=80&buff.enrage.down",
  "actions+=/recklessness,if=cooldown.avatar.ready",
  "actions+=/whirlwind,if=active_enemies>=3",
  "actions+=/execute,if=target.health.pct<=20",
];
const rules = lines.map((line, index) => parseAplRule(line, index));
assert(rules.every(Boolean), "Supported maintained APL lines did not parse");
assert(rules.map(serializeAplRule).join("\n") === lines.map((line) => line.split("=/")[1]).join("\n"), "APL parser/serializer changed maintained semantics");
const validation = validateAplRules(rules, ["rampage", "recklessness", "avatar", "whirlwind", "execute"], { resources: ["rage"], buffs: ["enrage"], cooldowns: ["avatar"] });
assert(validation.valid, `Valid APL was rejected: ${validation.errors.join(",")}`);
assert(priorityToAplRules(["rampage", "execute"]).every((rule) => rule.source === "custom"), "Legacy priority conversion lost provenance");
assert(parseAplRule("actions+=/rampage,if=rage>=80;override.bloodlust=1") === null, "Raw SimC injection was accepted");
const invalid = validateAplRules([{ ...rules[0], conditions: [{ type: "cooldown", abilityId: "not-allowed", state: "ready" }] }], ["rampage"], { resources: ["rage"], buffs: ["enrage"], cooldowns: [] });
assert(!invalid.valid, "Unknown cooldown ability passed validation");

console.log(JSON.stringify({ status: "passed", rules: rules.length, roundTrip: true, provenance: true, injectionBlocked: true }, null, 2));
