export type Locale = "en_US" | "ru_RU";
export type Section = "characters" | "talents" | "weapons" | "artifact-sets" | "content";

export type CatalogStatus = {
  ready: boolean;
  releaseId?: string;
  sourceRevision?: string;
  gameVersion?: string;
  publishedAt?: string;
  characters: number;
  weapons: number;
  artifactSets: number;
  talents: number;
  contentEntries: number;
  contentByCategory: Record<string, number>;
  mediaAssets: number;
  locales: string[];
};

export type Character = {
  id: number; externalId: number; slug: string; name: string; title: string;
  rarity: number; element: string; weaponType: string; region: string;
  iconUrl: string | null; portraitUrl: string | null; locale: Locale;
  localeFallback: boolean; talentCount: number;
};

export type CharacterDetail = Character & {
  description: string;
  stats?: CharacterStats | null;
  ascensionCosts: UpgradeCostStage[];
  levelingCosts: LevelingCosts;
  talents: Talent[];
  constellations: Constellation[];
};

type CharacterStats = {
  base: { hp: number; attack: number; defense: number; critRate: number; critDamage: number };
  curve: Record<string, string>;
  promotion: CharacterPromotion[];
  specialized: string;
};

type CharacterPromotion = {
  hp: number; attack: number; defense: number; maxLevel: number; specialized: number;
};

type UpgradeCostItem = {
  id: number; name: string; count: number; iconUrl?: string | null;
  locale?: Locale; localeFallback?: boolean;
};

export type UpgradeCostStage = { key: string; stage: number; maxLevel?: number; items: UpgradeCostItem[] };

type LevelProgressionCost = {
  level: number; nextLevel: number | null; expRequired: number; totalExp: number; moraCost: number;
};
type LevelMaterialCost = {
  fromLevel: number; toLevel: number; materialKey: string; materialId: number | null; name: string;
  count: number; experiencePerItem: number; experienceProvided: number; wastedExperience: number;
  moraCost: number; iconUrl?: string | null; locale: Locale; localeFallback: boolean;
};
export type LevelingCosts = { levels: LevelProgressionCost[]; materials: LevelMaterialCost[] };
export type TalentLevelCost = { level: number; items: UpgradeCostItem[] };

export type Weapon = {
  id: number; externalId: number; slug: string; name: string; rarity: number;
  weaponType: string; baseAttack: number | null; secondaryStat: string;
  secondaryStatValue: number | null; iconUrl: string | null; locale: Locale;
  localeFallback: boolean; description?: string; passiveName?: string; passiveDescription?: string;
};

export type WeaponDetail = Weapon & {
  description: string; passiveName: string; passiveDescription: string;
  stats?: WeaponStats | null;
  refinements: WeaponRefinement[]; ascensionCosts: UpgradeCostStage[];
  levelingCosts: LevelingCosts;
};

export type WeaponRefinement = { level: number; values: string[]; description: string };
type WeaponStats = {
  base: { attack: number; specialized: number };
  curve: Record<string, string>;
  promotion: WeaponPromotion[];
  specialized: string;
};
type WeaponPromotion = { attack: number; maxLevel: number };

export type ArtifactSet = {
  id: number; externalId: number; slug: string; name: string; minRarity: number;
  maxRarity: number; twoPieceBonus: string; fourPieceBonus: string;
  iconUrl: string | null; locale: Locale; localeFallback: boolean; pieceCount: number;
};

export type ArtifactPiece = {
  id: number; slot: string; name: string; description: string; iconUrl: string | null;
  locale: Locale; localeFallback: boolean;
};

export type ArtifactSource = {
  slug: string; name: string; region: string; entranceName: string;
  unlockRank: number; recommendedLevel: number;
  sourceKind: string; note?: string;
};

export type ArtifactDetail = ArtifactSet & { pieces: ArtifactPiece[]; sources: ArtifactSource[] };

export type Talent = {
  id: number; characterSlug: string; characterName: string; externalKey: string;
  kind: string; displayOrder: number; name: string; description: string;
  iconUrl: string | null; locale: Locale; localeFallback: boolean;
  upgradeCosts?: TalentLevelCost[];
};

export type Constellation = {
  id: number; characterSlug: string; externalKey: string; position: number;
  name: string; description: string; iconUrl: string | null; locale: Locale;
  localeFallback: boolean;
};

export type ImagePreview = { url: string; label: string };

type ContentMedia = { role: string; filename: string; url?: string | null };
export type Content = {
  id: number; externalId?: number | null; category: string; slug: string; name: string; description: string;
  iconUrl: string | null; media: ContentMedia[]; sourcePayload: Record<string, unknown>;
  localizedPayload: Record<string, unknown>; locale: Locale; localeFallback: boolean;
};

export type CatalogItem = Character | Talent | Weapon | ArtifactSet | Content;
export type CatalogPage<T> = { data: T[]; pagination: { nextCursor?: string; hasMore: boolean; limit: number } };
