/** Data of one Midnight profession page, built by scripts/build-wow-professions.mjs into data/wow/professions/<slug>.json. */
export type L10n = { en: string; ru: string };
export type ProfessionKind = "crafting" | "gathering" | "secondary";
/** How a recipe is learned. "research" — unlocked at the profession's own station in Silvermoon. */
export type RecipeSource = "start" | "trainer" | "research" | "specialization" | "vendor" | "quest" | "drop";

export type ProfessionItem = {
  name: L10n;
  icon: string | null;
  quality: number;
  /** Every quality rank of a reagent or crafted good, lowest first (the key is rank 1). */
  ranks?: number[];
  /** Vendor price in copper of a plain reagent; used only when the auction house has none. */
  vendor?: number;
};

export type ProfessionRecipe = {
  /** Blizzard recipe id. */
  id: number;
  spell: number;
  name: L10n;
  category: L10n;
  /** Skill at which the recipe turns yellow, and grey (no more skill-ups). */
  yellow: number;
  grey: number;
  /** Skill points per skill-up. */
  ups: number;
  source: RecipeSource;
  trainingCost?: number;
  /** [rank-1 item id, quantity per craft]. */
  reagents: [number, number][];
  output?: { item: number; qty: number; ranks?: number[] };
};

export type ProfessionPlace = { npc: number; name: L10n; map: number; zone: L10n; x: number; y: number };
export type KnowledgeKind = "quest" | "treatise" | "cache" | "gathering" | "disenchanting" | "book";
export type KnowledgeSource = { kind: KnowledgeKind; items: number[]; points: number; vendor?: ProfessionPlace };
export type KnowledgeTreasure = { map: number; zone: L10n; x: number; y: number; quest: number; item: number; points: number };

export type SpecializationNode = {
  id: number;
  name: L10n;
  text: L10n;
  ranks: number;
  perks: { at: number; text: L10n; recipe?: number }[];
  children: SpecializationNode[];
};

export type ProfessionData = {
  slug: string;
  id: number;
  kind: ProfessionKind;
  name: L10n;
  icon: string;
  maxSkill: number;
  trainer: ProfessionPlace;
  recipes: ProfessionRecipe[];
  gathered?: number[];
  knowledge: { weekly: KnowledgeSource[]; oneTime: KnowledgeSource[]; treasures: KnowledgeTreasure[] };
  specializations: SpecializationNode[];
  items: Record<string, ProfessionItem>;
};

export type ProfessionSummary = { slug: string; kind: ProfessionKind; name: L10n; icon: string; recipes: number; treasures: number; specializations: number };

/** Commodity price of one item (copper per unit) with the cheapest price levels for buying in bulk. */
export type ProfessionPrice = { min: number; median: number; quantity: number; ladder: [number, number][] };
export type ProfessionPrices = Record<string, ProfessionPrice>;
