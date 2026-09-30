import type { RotationAplCondition, RotationAplOptions, RotationAplRule } from "./types.ts";

const identifier = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const operators = { gte: ">=", lte: "<=" } as const;

export type AplValidation = { valid: boolean; errors: string[] };

function simcId(value: string) {
  return value.replaceAll("-", "_");
}

function appId(value: string) {
  return value.replaceAll("_", "-");
}

export function priorityToAplRules(rules: string[], source: RotationAplRule["source"] = "custom"): RotationAplRule[] {
  return rules.map((abilityId, index) => ({ id: `${source}-${index}-${abilityId}`, abilityId, conditions: [], source }));
}

export function serializeAplCondition(condition: RotationAplCondition) {
  if (condition.type === "resource") return `${simcId(condition.resource)}${operators[condition.operator]}${condition.value}`;
  if (condition.type === "buff") return `buff.${simcId(condition.aura)}.${condition.state}`;
  if (condition.type === "cooldown") return `cooldown.${simcId(condition.abilityId)}.${condition.state}`;
  if (condition.type === "targets") return `active_enemies${operators[condition.operator]}${condition.value}`;
  return `target.health.pct<=${condition.value}`;
}

export function serializeAplRule(rule: RotationAplRule) {
  const action = simcId(rule.abilityId);
  return rule.conditions.length ? `${action},if=${rule.conditions.map(serializeAplCondition).join("&")}` : action;
}

export function parseAplCondition(expression: string): RotationAplCondition | null {
  let match = expression.match(/^([a-z0-9_]+)(>=|<=)(\d+(?:\.\d+)?)$/);
  if (match && match[1] !== "active_enemies") return { type: "resource", resource: appId(match[1]), operator: match[2] === ">=" ? "gte" : "lte", value: Number(match[3]) };
  match = expression.match(/^buff\.([a-z0-9_]+)\.(up|down)$/);
  if (match) return { type: "buff", aura: appId(match[1]), state: match[2] as "up" | "down" };
  match = expression.match(/^cooldown\.([a-z0-9_]+)\.(ready|down)$/);
  if (match) return { type: "cooldown", abilityId: appId(match[1]), state: match[2] as "ready" | "down" };
  match = expression.match(/^active_enemies(>=|<=)(\d+)$/);
  if (match) return { type: "targets", operator: match[1] === ">=" ? "gte" : "lte", value: Number(match[2]) };
  match = expression.match(/^target\.health\.pct<=(\d+(?:\.\d+)?)$/);
  if (match) return { type: "execute", operator: "lte", value: Number(match[1]) };
  return null;
}

export function parseAplRule(line: string, index = 0): RotationAplRule | null {
  const payload = line.includes("=/") ? line.slice(line.indexOf("=/") + 2) : line;
  const [ability, ...modifiers] = payload.trim().split(",");
  if (!identifier.test(ability)) return null;
  const conditionText = modifiers.find((modifier) => modifier.startsWith("if="))?.slice(3) ?? "";
  const conditions = conditionText ? conditionText.split("&").map(parseAplCondition) : [];
  if (conditions.some((condition) => !condition)) return null;
  return { id: `maintained-${index}-${appId(ability)}`, abilityId: appId(ability), conditions: conditions as RotationAplCondition[], source: "maintained" };
}

export function validateAplRules(rules: RotationAplRule[], allowedAbilities: string[], options?: RotationAplOptions): AplValidation {
  const errors: string[] = [];
  const allowed = new Set(allowedAbilities);
  const optionBuffs = new Set(options?.buffs ?? []);
  const optionResources = new Set(options?.resources ?? []);
  const optionCooldowns = new Set(options?.cooldowns ?? []);
  if (!rules.length || rules.length > 10) errors.push("invalid_rule_count");
  const seen = new Set<string>();
  for (const rule of rules) {
    if (!identifier.test(rule.id) || !identifier.test(rule.abilityId) || !allowed.has(rule.abilityId)) errors.push(`invalid_ability:${rule.abilityId}`);
    if (seen.has(rule.abilityId)) errors.push(`duplicate_ability:${rule.abilityId}`);
    seen.add(rule.abilityId);
    if (rule.source !== "maintained" && rule.source !== "custom") errors.push(`invalid_source:${rule.id}`);
    if (!Array.isArray(rule.conditions) || rule.conditions.length > 3) { errors.push(`invalid_condition_count:${rule.id}`); continue; }
    for (const condition of rule.conditions) {
      if (condition.type === "resource") {
        if (!identifier.test(condition.resource) || (options && !optionResources.has(condition.resource)) || !Number.isFinite(condition.value) || condition.value < 0 || condition.value > 1000) errors.push(`invalid_resource:${rule.id}`);
      } else if (condition.type === "buff") {
        if (!identifier.test(condition.aura) || (options && !optionBuffs.has(condition.aura))) errors.push(`invalid_buff:${rule.id}`);
      } else if (condition.type === "cooldown") {
        if (!identifier.test(condition.abilityId) || !allowed.has(condition.abilityId) || (options && !optionCooldowns.has(condition.abilityId))) errors.push(`invalid_cooldown:${rule.id}`);
      } else if (condition.type === "targets") {
        if (!Number.isInteger(condition.value) || condition.value < 1 || condition.value > 8) errors.push(`invalid_targets:${rule.id}`);
      } else if (condition.type === "execute") {
        if (!Number.isFinite(condition.value) || condition.value < 1 || condition.value > 100) errors.push(`invalid_execute:${rule.id}`);
      } else errors.push(`invalid_condition:${rule.id}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
