import type { GearCandidate } from "./gearCandidates";
import type { compareGearSimulationResults } from "./gearSimulation";

export type AuctionGearObjective = "value" | "dps";

export type AuctionGearOption = {
  id: string;
  auctionId: number;
  quantity: number;
  costCopper: number;
  candidate: GearCandidate;
  variantKey: string;
};
export type GearPlanSimulation = {
  dps: number;
  dpsError: number;
  confidence: number;
  iterations: number;
  engine: string;
};
export type AuctionEquippedItem = {
  itemId: number;
  name: string;
  slotType: string;
  iconUrl?: string;
  quality?: number;
  itemClassId?: number;
  itemLevel?: number;
  requiredLevel?: number;
  stats?: Record<string, number>;
  effects?: string[];
  effectsVerified?: boolean;
  weapon?: { minDamage: number; maxDamage: number; dps: number; speedSeconds: number };
};
export type AuctionGearPurchase = {
  auctionId: number;
  itemId: number;
  name: string;
  iconUrl?: string;
  quality?: number;
  itemClassId?: number;
  slotType: string;
  variantKey: string;
  itemLevel: number;
  requiredLevel?: number;
  bonusIds?: number[];
  contextId?: number;
  modifiers?: Array<{ type: number; value: number }>;
  stats?: Record<string, number>;
  weapon?: { minDamage: number; maxDamage: number; dps: number; speedSeconds: number };
  effects?: string[];
  effectsVerified?: boolean;
  currentItem?: AuctionEquippedItem;
  lotCostCopper: number;
  quantity: number;
};
export type AuctionGearComparison = ReturnType<typeof compareGearSimulationResults>;
export type AuctionGearConfirmed = {
  spentCopper: number;
  remainingCopper: number;
  purchases: AuctionGearPurchase[];
  removedSlots: string[];
  comparison: AuctionGearComparison;
};
export type AuctionGearPlan = {
  budgetCopper: number;
  spentCopper: number;
  remainingCopper: number;
  purchases: AuctionGearPurchase[];
  removedSlots: string[];
  comparison: AuctionGearComparison;
  engine: string;
  simulations: number;
  searchLimited: boolean;
  optionsConsidered: number;
};
export type AuctionPlanProgress = {
  phase: "market" | "catalog" | "variants" | "simulating";
  completed: number;
  total: number;
};
export type AuctionGearEvaluation = "upgrade" | "not_upgrade" | "inconclusive" | "requires_combination" | "pending";
export type AuctionGearSearchItem = AuctionGearPurchase & {
  optionId: string;
  comparison: AuctionGearComparison | null;
  evaluation: AuctionGearEvaluation;
};
export type AuctionGearSearchResult = {
  kind: "search";
  objective?: AuctionGearObjective;
  searchId: string;
  selectedSlots: string[];
  budgetCopper: number;
  baseline: GearPlanSimulation;
  items: AuctionGearSearchItem[];
  searchComplete: boolean;
  /** Every affordable item/variant in this market snapshot has been inspected. */
  discoveryComplete?: boolean;
  /** No item or variant remains unverified because required data was unavailable. */
  dataComplete?: boolean;
  pendingItems: number;
  simulations: number;
  engine: string;
  searchLimited: boolean;
  optionsConsidered: number;
};
export type AuctionGearAssemblyResult = AuctionGearPlan & {
  kind: "assembly";
  objective?: AuctionGearObjective;
  searchId: string;
  selectedSlots: string[];
  /** Best visited affordable upgrade whose gain is confirmed independently of the measured maximum. */
  bestConfirmed: AuctionGearConfirmed | null;
  exhaustiveComplete: boolean;
  combinationsChecked: number;
  validCombinations: number;
  combinationKind: "effects";
  /** Exact effect-choice Cartesian upper bound, including incompatible and over-budget states. */
  combinationCount: string;
  discoveryComplete?: boolean;
  dataComplete?: boolean;
  /** Refreshed candidates and prices after market availability is revalidated. */
  updatedSearch?: AuctionGearSearchResult;
  marketChange?: {
    removedLots: number;
    repricedLots: number;
    quantityChangedLots: number;
    variantsChangedLots: number;
  };
};
export type AuctionGearSimulationCache = Record<string, GearPlanSimulation>;
/** Opaque effect-group identities include the native variant and equip constraints, never lot prices or IDs. */
export type AuctionGearIncumbent = { effects: string[]; simulation: GearPlanSimulation };
export type AuctionGearSearchCheckpoint = {
  version: 1 | 2;
  inputKey: string;
  nextOption: number;
  /** Required for v2 priority cursors; absent in legacy v1 canonical cursors. */
  optionOrder?: string[];
  baseline: GearPlanSimulation;
  simulationCache: AuctionGearSimulationCache;
  simulations: number;
};
export type AuctionGearAssemblyCheckpoint = {
  version: 3;
  inputKey: string;
  /** Next mixed-radix effect-group assignment. Zero keeps the current item. */
  cursor: number[];
  /** Frozen cached-single scores keep useful-pair ordering stable across resumes. */
  pairScores: number[];
  /** Next pair in the deterministic early-evaluation order. */
  nextPair: number;
  /** Bounded complete-set warmup; null means it has not been prepared yet. These are flat effect-group indices. */
  seedSelections: number[][] | null;
  nextSeed: number;
  exhausted: boolean;
  baseline: GearPlanSimulation;
  best: { optionIds: string[]; simulation: GearPlanSimulation };
  bestConfirmed: { optionIds: string[]; simulation: GearPlanSimulation } | null;
  simulationCache: AuctionGearSimulationCache;
  simulations: number;
  combinationsChecked: number;
  validCombinations: number;
};
