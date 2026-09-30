import type { Lang } from "@/lib/i18n";

export type RotationScenario = "single-target" | "aoe" | "execute";

export type RotationAbility = {
  id: string;
  name: string;
  hint: string;
  iconUrl: string;
  spellId?: number;
  category?: "core" | "class" | "spec" | "hero" | "pvp";
  source?: "maintained-apl" | "simulationcraft" | "active-talent";
};

export type RotationAplCondition =
  | { type: "resource"; resource: string; operator: "gte" | "lte"; value: number }
  | { type: "buff"; aura: string; state: "up" | "down" }
  | { type: "cooldown"; abilityId: string; state: "ready" | "down" }
  | { type: "targets"; operator: "gte" | "lte"; value: number }
  | { type: "execute"; operator: "lte"; value: number };

export type RotationAplRule = {
  id: string;
  abilityId: string;
  conditions: RotationAplCondition[];
  source: "maintained" | "custom";
};

export type RotationAplOptions = {
  resources: string[];
  buffs: string[];
  cooldowns: string[];
  labels?: Record<string, string>;
};

export type RotationPreset = {
  slug: string;
  className: string;
  specialization: string;
  patch: string;
  engineLabel: string;
  resourceLabel: string;
  locale: Lang;
  gameLabels?: Record<string, string>;
  character: {
    name: string;
    level: number;
    itemLevel: number;
    iconUrl: string;
  };
  abilities: RotationAbility[];
  defaultRules: string[];
  defaultAplRules?: RotationAplRule[];
  aplSource?: { kind: "simulationcraft-maintained" | "gildra-fallback"; label: string; profile?: string };
  aplOptions?: RotationAplOptions;
};

export type RotationSimulationInput = {
  spec: string;
  scenario: RotationScenario;
  fightLengthSeconds: number;
  targets: number;
  rules: string[];
  aplRules?: RotationAplRule[];
  talentLoadout?: string;
  characterSlug?: string;
  dataMode?: "fixture" | "battle-net";
  /** Candidate scoring does not consume the presentation baseline; the verified winner still computes it. */
  skipBaseline?: boolean;
  verificationRun?: boolean;
};

export type RotationBuildProfile = {
  id: string;
  name: string;
  talentLoadout: string;
  source: "reference" | "custom";
  createdAt: number;
  updatedAt: number;
};

export type RotationSequenceSource =
  | "simulation-trace"
  | "maintained-apl"
  | "custom-apl"
  | "saved-combo"
  | "imported-tag"
  | "burst-preset";

export type SavedRotationCombo = {
  id: string;
  name: string;
  nameSource?: "generated" | "custom";
  buildId: string;
  buildName: string;
  scenario: RotationScenario;
  targetCount?: number;
  rules: string[];
  aplRules?: RotationAplRule[];
  sequence: string[];
  sequenceSource?: RotationSequenceSource;
  abilities?: RotationAbility[];
  dps: number;
  engine: string;
  verified?: boolean;
  verificationDelta?: number;
  createdAt: number;
  updatedAt: number;
};

export type RotationCast = {
  id: string;
  abilityId: string;
  time: number;
  lane: "global" | "major" | "proc";
  duration?: number;
  resources?: Record<string, number>;
  buffs?: string[];
};

export type RotationResourcePoint = { time: number; value: number };

export type RotationResourceTrack = {
  key: string;
  label: string;
  maximum: number;
  average: number;
  minimum: number;
  peak: number;
  efficiency: number;
  points: RotationResourcePoint[];
};

export type RotationProcWindow = {
  id: string;
  name: string;
  time: number;
  duration: number;
};

export type RotationCooldownWindow = {
  abilityId: string;
  name: string;
  uses: number[];
  duration?: number;
  averageInterval?: number;
};

export type RotationAccuracy = {
  mode: "simulationcraft-reference" | "simulationcraft-armory" | "training-model";
  rotationSource: "simulationcraft-default-apl" | "user-priority-model";
  considers: string[];
  limitations: string[];
};

export type RotationFinding = {
  id: string;
  kind: "opportunity" | "drift" | "overcap";
  time: number;
  title: string;
  detail: string;
  severity: "high" | "medium";
};

export type RotationMetric = {
  label: string;
  value: string;
};

export type RotationSimulationResult = {
  id: string;
  status: "completed";
  engine: string;
  modelNotice: string;
  resourceLabel?: string;
  scenario: RotationScenario;
  fightLengthSeconds: number;
  targets: number;
  iterations: number;
  confidence: number;
  dps: number;
  dpsError?: number;
  baselineIncluded?: boolean;
  dpsSeries: number[];
  enrageUptime: number;
  rageEfficiency: number;
  castsPerMinute: number;
  baselineDelta: number;
  casts: RotationCast[];
  abilities?: RotationAbility[];
  recommendedSequence: string[];
  rage: RotationResourcePoint[];
  resources?: RotationResourceTrack[];
  procs?: RotationProcWindow[];
  cooldowns?: RotationCooldownWindow[];
  accuracy?: RotationAccuracy;
  findings: RotationFinding[];
  bossEvents: Array<{ time: number; duration: number; label: string; tone: "violet" | "gold" }>;
  metrics: RotationMetric[];
};
