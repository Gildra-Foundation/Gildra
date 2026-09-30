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
