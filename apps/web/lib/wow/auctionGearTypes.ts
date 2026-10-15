import type { GearCandidate } from "./gearCandidates";
import type { compareGearSimulationResults } from "./gearSimulation";

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
  itemLevel?: number;
  requiredLevel?: number;
  stats?: Record<string, number>;
  effects?: string[];
};
export type AuctionGearPurchase = {
  auctionId: number;
  itemId: number;
  name: string;
  iconUrl?: string;
  quality?: number;
  slotType: string;
  variantKey: string;
  itemLevel: number;
  requiredLevel?: number;
  bonusIds?: number[];
  contextId?: number;
  modifiers?: Array<{ type: number; value: number }>;
  stats?: Record<string, number>;
  currentItem?: AuctionEquippedItem;
  lotCostCopper: number;
  quantity: number;
};
export type AuctionGearComparison = ReturnType<typeof compareGearSimulationResults>;
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
  searchId: string;
  selectedSlots: string[];
  budgetCopper: number;
  baseline: GearPlanSimulation;
  items: AuctionGearSearchItem[];
  searchComplete: boolean;
  pendingItems: number;
  simulations: number;
  engine: string;
  searchLimited: boolean;
  optionsConsidered: number;
};
export type AuctionGearAssemblyResult = AuctionGearPlan & {
  kind: "assembly";
  searchId: string;
  selectedSlots: string[];
  exhaustiveComplete: boolean;
  combinationsChecked: number;
  validCombinations: number;
  /** Exact Cartesian upper bound, including incompatible and over-budget states. */
  combinationCount: string;
};
export type AuctionGearSimulationCache = Record<string, GearPlanSimulation>;
export type AuctionGearSearchCheckpoint = {
  version: 1;
  inputKey: string;
  nextOption: number;
  baseline: GearPlanSimulation;
  simulationCache: AuctionGearSimulationCache;
  simulations: number;
};
export type AuctionGearAssemblyCheckpoint = {
  version: 1;
  inputKey: string;
  /** Next mixed-radix assignment. Zero keeps the current item. */
  cursor: number[];
  exhausted: boolean;
  baseline: GearPlanSimulation;
  best: { optionIds: string[]; simulation: GearPlanSimulation };
  simulationCache: AuctionGearSimulationCache;
  simulations: number;
  combinationsChecked: number;
  validCombinations: number;
};
