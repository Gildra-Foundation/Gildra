/** Display facts for one exact item; never fill scaled values from a base tooltip. */
export type GearPlannerItemData = {
  itemId: number;
  name: string;
  iconUrl?: string;
  quality?: number;
  itemLevel?: number;
  requiredLevel?: number;
  slotType?: string;
  stats?: Record<string, number>;
  /** Already localized lines from the actual equipped Blizzard preview. */
  statLines?: string[];
  /** Effect text is included only when it describes the actual item variant. */
  effects?: string[];
  source?: string;
};
