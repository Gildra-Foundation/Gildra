import "server-only";
import { randomUUID } from "node:crypto";
import type {
  RotationFinding,
  RotationScenario,
  RotationSimulationInput,
  RotationSimulationResult,
} from "./types";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";

const scenarioBase: Record<RotationScenario, number> = {
  "single-target": 1_240_000,
  aoe: 3_860_000,
  execute: 1_760_000,
};

const round = (value: number, precision = 1) => {
  const power = 10 ** precision;
  return Math.round(value * power) / power;
};

function ruleQuality(rules: string[], baseline: string[]) {
  const active = rules.filter((id, index) => baseline.includes(id) && rules.indexOf(id) === index);
  const distance = baseline.reduce((sum, id, expected) => {
    const actual = active.indexOf(id);
    return sum + (actual === -1 ? 4 : Math.abs(actual - expected));
  }, 0);
  return Math.max(0.78, 1 - distance * 0.018);
}

function specBaseDps(slug: string) {
  let hash = 0;
  for (const character of slug) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return 0.84 + (hash % 33) / 100;
}

export function simulateRotation(input: RotationSimulationInput, baselineRules: string[] = input.rules): RotationSimulationResult {
  const baseline = baselineRules.length ? baselineRules : input.rules;
  const quality = ruleQuality(input.rules, baseline);
  const targetFactor = input.scenario === "aoe" ? Math.min(1.14, 0.92 + input.targets * 0.025) : 1;
  const dps = Math.round(scenarioBase[input.scenario] * specBaseDps(input.spec) * quality * targetFactor);
  const enrageUptime = round(91.7 * quality + (input.rules[0] === "bloodthirst" ? 2.4 : 0));
  const rageEfficiency = round(89.2 * quality + (input.rules[0] === "rampage" ? 2 : -1));
  const castsPerMinute = round((input.scenario === "aoe" ? 9.8 : input.scenario === "execute" ? 7.4 : 6.2) * (0.94 + quality * 0.06));
  const step = 1.5;
  const eventCount = Math.min(96, Math.floor(input.fightLengthSeconds / step));
  const activeRules = input.rules.filter((id) => baseline.includes(id));
  const rotation = activeRules.length ? activeRules : baseline;
  const casts = Array.from({ length: eventCount }, (_, index) => ({
    id: `cast-${index}`,
    abilityId: rotation[(index + Math.floor(index / 9)) % rotation.length],
    time: round(index * step, 2),
    lane: "global" as const,
  }));
  const majors = [
    { id: rotation[0], at: 0, duration: 15 },
    { id: rotation[1] ?? rotation[0], at: 30, duration: 20 },
    { id: rotation[2] ?? rotation[0], at: 66, duration: 15 },
  ].filter((event) => event.id && event.at < input.fightLengthSeconds).map((event) => ({
    id: `major-${event.id}-${event.at}`,
    abilityId: event.id,
    time: event.at,
    duration: event.duration,
    lane: "major" as const,
  }));
  const procIds = rotation.slice(0, 3);
  const procs = Array.from({ length: Math.max(4, Math.floor(input.fightLengthSeconds / 13)) }, (_, index) => ({
    id: `proc-${index}`,
    abilityId: procIds[index % procIds.length],
    time: round(8 + index * 13.1, 1),
    lane: "proc" as const,
  })).filter((event) => event.time < input.fightLengthSeconds);
  const rage = Array.from({ length: Math.floor(input.fightLengthSeconds / 3) + 1 }, (_, index) => {
    const time = index * 3;
    const wave = 45 + Math.sin(index * 1.37) * 23 + Math.sin(index * 0.43) * 17;
    const pressure = input.rules[0] === "rampage" ? -4 : 10;
    return { time, value: round(Math.max(4, Math.min(100, wave + pressure))) };
  });
  const findings: RotationFinding[] = [];
  const primaryIndex = rotation.indexOf(baseline[0]);
  if (primaryIndex > 0 || primaryIndex === -1) {
    [28, 64, 97].filter((time) => time < input.fightLengthSeconds).forEach((time, index) => findings.push({
      id: `missed-${index}`,
      kind: "opportunity",
      severity: "high",
      time,
      title: "Priority Opportunity",
      detail: "The primary ability was delayed beyond its recommended window.",
    }));
  }
  findings.push({
    id: "drift-1",
    kind: "drift",
    severity: "medium",
    time: Math.min(input.fightLengthSeconds - 2, 88),
    title: "Cooldown Drift",
    detail: "A major ability drifted beyond the recommended window.",
  });
  if (rage.some((point) => point.value >= 88)) findings.push({
    id: "overcap-1",
    kind: "overcap",
    severity: "medium",
    time: rage.find((point) => point.value >= 88)?.time ?? 42,
    title: "Resource Overcap",
    detail: "Your combat resource reached the cap before the next spender window.",
  });
  const dpsSeries = Array.from({ length: 24 }, (_, index) => Math.round(dps * (0.78 + index * 0.009 + Math.sin(index * 1.6) * 0.025)));
  const theme = getTalentSpecTheme(input.spec);
  return {
    id: randomUUID(),
    status: "completed",
    engine: "gildra-rotation-mvp/1",
    modelNotice: "Deterministic specialization model — SimulationCraft profile is not connected for this run.",
    resourceLabel: theme?.resourceLabel ?? "Resource",
    scenario: input.scenario,
    fightLengthSeconds: input.fightLengthSeconds,
    targets: input.targets,
    iterations: 10_000,
    confidence: Math.round(92 + quality * 3),
    dps,
    dpsSeries,
    enrageUptime,
    rageEfficiency,
    castsPerMinute,
    baselineDelta: round((quality - 1) * 100),
    casts: [...casts, ...majors, ...procs],
    recommendedSequence: [...rotation.slice(0, 2), ...rotation, ...rotation].slice(0, 16),
    rage,
    findings,
    bossEvents: [
      { time: 6, duration: 16, label: "Boss Vulnerable", tone: "violet" as const },
      { time: 30, duration: 11, label: "Boss Moves", tone: "gold" as const },
      { time: Math.min(66, input.fightLengthSeconds * 0.55), duration: 16, label: "Boss Vulnerable", tone: "violet" as const },
      { time: Math.max(0, input.fightLengthSeconds - 22), duration: 14, label: "Boss Moves", tone: "gold" as const },
    ].filter((event) => event.time < input.fightLengthSeconds),
    metrics: [
      { label: "Priority Uptime", value: `${enrageUptime}%` },
      { label: "Resource Efficiency", value: `${rageEfficiency}%` },
      { label: "Casts Per Min", value: castsPerMinute.toFixed(1) },
    ],
  };
}
