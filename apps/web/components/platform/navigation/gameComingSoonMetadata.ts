import type { Metadata } from "next";
import type { UpcomingGame } from "@/lib/games/destinations";
import type { Lang } from "@/lib/i18n-paths";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
import { gameComingSoonCopy as copy } from "./gameComingSoonCopy";

export function gameComingSoonMetadata(game: UpcomingGame, lang: Lang): Metadata {
  const title = `${game.name} — ${copy[lang].eyebrow} · Gildra`;
  return {
    title,
    description: copy[lang].description,
    robots: { index: false, follow: true },
    alternates: pairedAlternates(lang, game.path),
    openGraph: pageOpenGraph(lang, { title, description: copy[lang].description, path: lang === "ru" ? `/ru${game.path}` : game.path }),
  };
}
