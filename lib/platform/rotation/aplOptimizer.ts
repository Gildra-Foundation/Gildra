import { validateAplRules } from "./apl.ts";
import type { RotationAplOptions, RotationAplRule, RotationScenario } from "./types.ts";

export type AplOptimizerCandidate = {
  id: string;
  label: string;
  reason: string;
  rules: string[];
  aplRules: RotationAplRule[];
  mutation: "baseline" | "priority" | "threshold" | "state";
};

export type AplSearchSpace = {
  candidates: AplOptimizerCandidate[];
  considered: number;
  limit: number;
  dimensions: string[];
};

const clone = (rules: RotationAplRule[]) => structuredClone(rules);
const fingerprint = (rules: RotationAplRule[]) => JSON.stringify(rules.map(({ abilityId, conditions }) => ({ abilityId, conditions })));

function candidate(id: string, label: string, reason: string, aplRules: RotationAplRule[], mutation: AplOptimizerCandidate["mutation"]): AplOptimizerCandidate {
  return { id, label, reason, aplRules, rules: aplRules.map((rule) => rule.abilityId), mutation };
}

export function generateAplCandidates({ aplRules, scenario, targets, allowedAbilities, options, limit = 12 }: {
  aplRules: RotationAplRule[];
  scenario: RotationScenario;
  targets: number;
  allowedAbilities: string[];
  options?: RotationAplOptions;
  limit?: number;
}): AplSearchSpace {
  const generated: AplOptimizerCandidate[] = [candidate("baseline", "Current APL", "Unchanged comparison baseline", clone(aplRules), "baseline")];
  const push = (entry: AplOptimizerCandidate) => {
    if (validateAplRules(entry.aplRules, allowedAbilities, options).valid) generated.push(entry);
  };

  // Only adjacent moves in the high-priority window are explored. This keeps
  // the search bounded and preserves most of the maintained profile's intent.
  for (let index = 0; index < Math.min(5, aplRules.length - 1); index += 1) {
    const next = clone(aplRules);
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    push(candidate(`swap-${index}-${index + 1}`, `Priority ${index + 1} ↔ ${index + 2}`, "Tests one adjacent priority change", next, "priority"));
  }

  let numericIndex = 0;
  for (let ruleIndex = 0; ruleIndex < aplRules.length; ruleIndex += 1) {
    for (let conditionIndex = 0; conditionIndex < aplRules[ruleIndex].conditions.length; conditionIndex += 1) {
      const condition = aplRules[ruleIndex].conditions[conditionIndex];
      if (condition.type !== "resource" && condition.type !== "targets" && condition.type !== "execute") continue;
      const step = condition.type === "resource" ? 10 : condition.type === "execute" ? 5 : 1;
      const maximum = condition.type === "resource" ? 1000 : condition.type === "execute" ? 100 : 8;
      const preferred = condition.type === "targets" && scenario === "aoe" ? Math.max(2, targets) : condition.value;
      for (const value of [...new Set([preferred - step, preferred + step])]) {
        if (value < (condition.type === "resource" ? 0 : 1) || value > maximum) continue;
        const next = clone(aplRules);
        next[ruleIndex].conditions[conditionIndex] = { ...condition, value };
        next[ruleIndex].source = "custom";
        push(candidate(`threshold-${numericIndex++}-${value}`, `${aplRules[ruleIndex].abilityId}: ${value}`, "Tests one nearby condition threshold", next, "threshold"));
      }
    }
  }

  let stateIndex = 0;
  for (let ruleIndex = 0; ruleIndex < aplRules.length; ruleIndex += 1) {
    for (let conditionIndex = 0; conditionIndex < aplRules[ruleIndex].conditions.length; conditionIndex += 1) {
      const condition = aplRules[ruleIndex].conditions[conditionIndex];
      if (condition.type !== "buff" && condition.type !== "cooldown") continue;
      const next = clone(aplRules);
      next[ruleIndex].conditions[conditionIndex] = condition.type === "buff"
        ? { ...condition, state: condition.state === "up" ? "down" : "up" }
        : { ...condition, state: condition.state === "ready" ? "down" : "ready" };
      next[ruleIndex].source = "custom";
      push(candidate(`state-${stateIndex++}`, `${aplRules[ruleIndex].abilityId}: alternate state`, "Tests one explicit buff or cooldown state", next, "state"));
    }
  }

  const unique: AplOptimizerCandidate[] = [];
  const seen = new Set<string>();
  for (const entry of generated) {
    const key = fingerprint(entry.aplRules);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return {
    candidates: unique.slice(0, Math.max(1, limit)),
    considered: unique.length,
    limit,
    dimensions: ["baseline", "adjacent priority", "numeric thresholds", "buff/cooldown states"],
  };
}

export function verificationTolerance(firstDps: number, firstError: number | undefined, repeatedDps: number, repeatedError: number | undefined) {
  const absoluteDelta = Math.abs(firstDps - repeatedDps);
  const statistical = Math.max(Number(firstError) || 0, Number(repeatedError) || 0) * 3;
  const floor = Math.max(firstDps, repeatedDps) * 0.001;
  const tolerance = Math.max(1, statistical, floor);
  return { stable: absoluteDelta <= tolerance, absoluteDelta, tolerance };
}

export function meaningfulDpsGain(baselineDps: number, baselineError: number | undefined, candidateDps: number, candidateError: number | undefined) {
  const gain = candidateDps - baselineDps;
  const uncertainty = 2 * Math.hypot(Number(baselineError) || 0, Number(candidateError) || 0);
  const threshold = Math.max(1, uncertainty, baselineDps * 0.001);
  return { meaningful: gain > threshold, gain, threshold };
}
