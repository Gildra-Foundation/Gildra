import type { GearPlannerItemData } from "../gearPlannerPresentation";

export type FarmDungeonDifficulty = "normal" | "heroic" | "mythic" | "mythic-plus";
export type FarmRaidDifficulty = "raid-finder" | "normal" | "heroic" | "mythic";
export type GearFarmSettings = {
  dungeonDifficulty: FarmDungeonDifficulty;
  raidDifficulty: FarmRaidDifficulty;
  mythicKeyLevel?: number;
};
export type FarmUnsupportedReason = "difficulty_unverified" | "reward_sequence_unverified" | "source_unavailable" | "world_rewards_unverified";
export type FarmAccess = "level_condition_met" | "unlock_unverified" | "level_locked" | "gear_locked";
export type FarmProgress = {
  phase: "sources" | "rewards" | "simulating";
  completed: number;
  total: number;
};
export type FarmTarget = GearPlannerItemData & {
  itemId: number;
  entityId: string;
  name: string;
  slotType: string;
  currentItemId: number;
  currentItemLevel: number;
  currentItem?: GearPlannerItemData;
  encounterId: number;
  encounterName: string;
  verification: "simulated" | "item_level" | "scaling_unverified" | "not_upgrade" | "variant_verified";
  itemLevel?: number;
  requiredLevel?: number;
  deltaDps?: number;
  deltaPercent?: number;
  marginPercent?: number;
  bonusIds?: number[];
  contextId?: number;
  evidence?: { build: string; sourceHash: string; contextPickerId: number; treeIds: number[] };
  modifiers?: Array<{
    type: number;
    value: number;
  }>;
};
export type FarmActivity = {
  id: string;
  name: string;
  slug: string;
  instanceEntityId?: string;
  journalInstanceId?: number;
  imageUrl?: string;
  difficulty: FarmDungeonDifficulty | FarmRaidDifficulty | "world";
  difficultyId?: number;
  mythicKeyLevel?: number;
  unsupportedReason?: FarmUnsupportedReason;
  access: FarmAccess;
  unlockLevel?: number;
  minLevel?: number;
  minItemLevel?: number;
  recommendedItemLevel?: number;
  queueMinItemLevel?: number;
  queueGearSatisfied?: boolean;
  group: "dungeon" | "raid";
  sourceUrl: string;
  sourceVerifiedAt: string;
  targets: FarmTarget[];
  lootItemsChecked: number;
  variantsUnverified: number;
};
export type GearFarmResult = {
  character: {
    name: string;
    level: number;
    equippedItemLevel: number;
    specId: number;
  };
  activities: FarmActivity[];
  engine?: string;
  baselineDps?: number;
  checkedAt: string;
  profileFingerprint: string;
  settings?: GearFarmSettings;
  coverage: {
    instancesChecked: number;
    lootItemsChecked: number;
    exactVariants: number;
    simulations: number;
    searchLimited: boolean;
    unsupportedSources?: string[];
  };
};
export type GearFarmInput = {
  characterSlug: string;
  locale: "ru" | "en";
} & Partial<GearFarmSettings>;
export type GearFarmJob = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: FarmProgress | null;
  result: GearFarmResult | null;
  error: string | null;
};
