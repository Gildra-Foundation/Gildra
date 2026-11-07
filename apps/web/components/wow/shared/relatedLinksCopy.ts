/** Labels and addresses of the related-link rows (RelatedLinks): a spec's pages, a dungeon's runs, a profession's market. */
import type { Lang } from "@/lib/i18n-paths";

const prefix = (lang: Lang) => (lang === "ru" ? "/ru" : "");

export const relatedCopy = {
  en: {
    label: "Related pages",
    spec: "Spec overview", talents: "Talents", leaderboard: "Top players", mythicTier: "Mythic+ tier list", raidTier: "Raid tier list",
    meta: "Mythic+ meta", comps: "Team compositions", runs: "Timed runs", stats: "Season stats", professions: "Professions", auction: "Auction House",
  },
  ru: {
    label: "Связанные страницы",
    spec: "Обзор специализации", talents: "Таланты", leaderboard: "Лучшие игроки", mythicTier: "Тир-лист Mythic+", raidTier: "Тир-лист рейдов",
    meta: "Мета Mythic+", comps: "Составы групп", runs: "Забеги", stats: "Статистика сезона", professions: "Профессии", auction: "Аукцион",
  },
} as const;

export type SpecLinkKey = "spec" | "talents" | "leaderboard" | "mythicTier" | "raidTier" | "meta";

/** The pages of one specialization and the lists it ranks in, without the page the reader is on. */
export function specLinkTargets(lang: Lang, spec: { slug: string; classSlug: string }, without: readonly SpecLinkKey[] = []) {
  const p = prefix(lang);
  const all: Array<{ key: SpecLinkKey; href: string; label: string }> = [
    { key: "spec", href: `${p}/wow/classes/${spec.classSlug}/${spec.slug}`, label: relatedCopy[lang].spec },
    { key: "talents", href: `${p}/talents/${spec.slug}`, label: relatedCopy[lang].talents },
    { key: "leaderboard", href: `${p}/wow/mythic-plus/leaderboard/${spec.slug}`, label: relatedCopy[lang].leaderboard },
    { key: "mythicTier", href: `${p}/tier-lists`, label: relatedCopy[lang].mythicTier },
    { key: "raidTier", href: `${p}/tier-lists/raid`, label: relatedCopy[lang].raidTier },
    { key: "meta", href: `${p}/wow/mythic-plus/meta`, label: relatedCopy[lang].meta },
  ];
  return all.filter((link) => !without.includes(link.key));
}

/** Auction categories that sell what a profession gathers, crafts or uses (keys of lib/wow/auctionMarketCategories.ts). */
export const professionAuctionCategories: Readonly<Record<string, readonly string[]>> = {
  alchemy: ["herbs", "potions", "flasks"],
  blacksmithing: ["ore", "weapons", "armor"],
  enchanting: ["enchanting", "enhancements"],
  engineering: ["parts", "ore"],
  inscription: ["inscription", "herbs"],
  jewelcrafting: ["gems", "ore"],
  leatherworking: ["leather", "armor"],
  tailoring: ["cloth", "armor"],
  herbalism: ["herbs"],
  mining: ["ore"],
  skinning: ["leather"],
  cooking: ["cooking", "food"],
  fishing: ["cooking"],
};

/** /wow/auction opened on a category. */
export const auctionCategoryHref = (lang: Lang, category: string) => `${prefix(lang)}/wow/auction?cat=${encodeURIComponent(category)}`;
