import type { Lang as Locale } from "@/lib/i18n-paths";

/**
 * Search titles of tool pages whose on-page heading is a single word
 * ("Professions", "Аукцион"): the <title> names the game and what the page
 * does, so results are not a bare word. Headings stay as they are.
 */
export const seoTitles = {
  professions: { en: "WoW Professions: Leveling and Profitable Crafts — Gildra", ru: "Профессии WoW: прокачка и выгодные рецепты — Gildra" },
  auction: { en: "WoW Auction House Prices and Market — Gildra", ru: "Аукцион WoW: цены и рынок — Gildra" },
  transmog: { en: "WoW Transmog Studio: Try On Appearances — Gildra", ru: "Трансмогрификация WoW: примерочная обликов — Gildra" },
} satisfies Record<string, Record<Locale, string>>;

/** "Alchemy Leveling Guide 1–100 (Midnight) — Gildra" / "Алхимия: прокачка 1–100 в Midnight — Gildra". */
export const professionSeoTitle = (locale: Locale, name: string) =>
  locale === "ru" ? `${name}: прокачка 1–100 в Midnight — Gildra` : `${name} Leveling Guide 1–100 (Midnight) — Gildra`;

/** Search descriptions of tool pages whose on-page lede is one short line. */
export const seoDescriptions = {
  auction: {
    en: "World of Warcraft Auction House prices: reagents and commodities of your region and your realm's auctions, searchable by item and category.",
    ru: "Цены аукциона World of Warcraft: реагенты и товары вашего региона и лоты вашего сервера с поиском по предмету и категории.",
  },
  transmog: {
    en: "Try any World of Warcraft appearance or set on a 3D character model: every race and class, weapons and outfits, then save the picture.",
    ru: "Примерьте любой облик или комплект World of Warcraft на 3D-модели: все расы и классы, оружие и наряды, затем сохраните кадр.",
  },
} satisfies Record<string, Record<Locale, string>>;
