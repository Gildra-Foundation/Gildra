export type GearPlannerWeapon = { minDamage: number; maxDamage: number; dps: number; speedSeconds: number };

/** Display facts for one exact item; never fill scaled values from a base tooltip. */
export type GearPlannerItemData = {
  itemId: number;
  name: string;
  iconUrl?: string;
  quality?: number;
  itemClassId?: number;
  itemLevel?: number;
  requiredLevel?: number;
  slotType?: string;
  stats?: Record<string, number>;
  /** Already localized lines from the actual equipped Blizzard preview. */
  statLines?: string[];
  /** Effect text is included only when it describes the actual item variant. */
  effects?: string[];
  effectsVerified?: boolean;
  weapon?: GearPlannerWeapon;
  source?: string;
};
