import type { ReviewedCombat } from "@/lib/data/wow/mythicCombat.types";
import type { MdtDataset, DungeonSourceReviewData } from "@/lib/data/wow/mythicReview.types";
export type EnemyMediaPayload = {
  npcId?: number;
  portraitUrl?: string;
  portraitScale?: number;
  portraitY?: string;
  identityVerified?: boolean;
  portraitVerified?: boolean;
  portraitStatus?: "model_unavailable";
};

export type AbilityMediaPayload = {
  spellId?: number;
  iconUrl: string;
  iconName: string;
};

export type DungeonCombatIntel = {
  reviewed?: ReviewedCombat;
  review: DungeonSourceReviewData;
  mdt: MdtDataset;
  enemies: Record<string, {
    intel?: { summary: string; danger: string };
    media?: EnemyMediaPayload;
  }>;
  abilities: Record<string, {
    intel?: { effect: string; failure: string };
    source?: string;
    media?: { media: AbilityMediaPayload; exact: boolean };
  }>;
};
