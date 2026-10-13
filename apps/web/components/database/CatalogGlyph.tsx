import { BookOpen, Database, Gem, Hammer, Map, ScrollText, Shield, ShoppingBag, Skull, Sparkles, Star, Sword } from "lucide-react";

/** Catalog icon symbols (the API's `iconSymbol`, e.g. "#ic-bag") drawn as inline Lucide icons, so they render without the page sprite. */
const GLYPHS = {
  "#ic-bag": ShoppingBag, "#ic-gem": Gem, "#ic-spark": Sparkles, "#ic-star": Star, "#ic-sword": Sword, "#ic-shield": Shield,
  "#ic-skull": Skull, "#ic-map": Map, "#ic-hammer": Hammer, "#ic-scroll": ScrollText, "#ic-book": BookOpen, "#ic-database": Database,
} as const;

/** Symbol of each record type, for places that know the type but not the API registry (search results). */
export const TYPE_SYMBOLS: Record<string, keyof typeof GLYPHS> = {
  item: "#ic-bag", gem: "#ic-gem", enchantment: "#ic-spark", item_set: "#ic-star", food: "#ic-bag", flask: "#ic-bag", potion: "#ic-bag",
  spell: "#ic-spark", class: "#ic-sword", specialization: "#ic-sword", talent: "#ic-sword", pvp_talent: "#ic-sword", talent_tree: "#ic-sword",
  instance: "#ic-shield", encounter: "#ic-skull", profession: "#ic-hammer", recipe: "#ic-scroll", creature: "#ic-skull",
  quest_reward_package: "#ic-bag", quest: "#ic-scroll", map: "#ic-map", ui_map: "#ic-map", area: "#ic-map", faction: "#ic-shield",
  currency: "#ic-gem", mount: "#ic-shield", battle_pet: "#ic-star", toy: "#ic-star", transmog_set: "#ic-star", achievement: "#ic-gem", season: "#ic-map",
};

export function CatalogGlyph({ symbol, className }: { symbol?: string; className?: string }) {
  const Icon = GLYPHS[(symbol ?? "") as keyof typeof GLYPHS] ?? Gem;
  return <Icon className={className} aria-hidden="true" strokeWidth={1.5} />;
}
