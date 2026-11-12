import type { Metadata } from "next";
import { pageOpenGraph, pairedAlternates } from "@/lib/seo/metadata";
import { leaderboardSpecBySlug } from "./mplusLeaderboardView";

/** Title, description, canonical and hreflang of a specialization's leaderboard page. */
export function leaderboardSpecMetadata(slug: string, locale: "en" | "ru"): Metadata {
  const spec = leaderboardSpecBySlug(slug);
  if (!spec) return {};
  const { theme } = spec;
  const title = locale === "ru"
    ? `Рейтинг Mythic+: ${theme.classNameRu}, ${theme.specNameRu.toLowerCase()} — WowArcana`
    : `${theme.specName} ${theme.className} Mythic+ Leaderboard — WowArcana`;
  const description = locale === "ru"
    ? `Лучшие игроки специализации «${theme.specNameRu}» (${theme.classNameRu.toLowerCase()}) по рейтингу Mythic+ в Европе, Америке, Корее и на Тайване: героические таланты, сборки и аксессуары.`
    : `The best ${theme.specName} ${theme.className}s by Mythic+ rating in Europe, the Americas, Korea and Taiwan: hero talents, builds and trinkets.`;
  const alternates = pairedAlternates(locale, `/wow/mythic-plus/leaderboard/${theme.slug}`);
  return { title, description, alternates, openGraph: pageOpenGraph(locale, { title, description, path: String(alternates.canonical) }) };
}
