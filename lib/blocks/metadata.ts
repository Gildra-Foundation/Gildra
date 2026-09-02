import type { Metadata } from "next";
import { gameHref, type GameDefinition } from "@/lib/games/registry";
import type { Lang } from "@/lib/i18n";

export type PageMetaInput = {
  /** Full document title (the author owns the format, e.g. "Mythic+ Tier List — Gildra"). */
  title: string;
  description?: string;
  image?: string;
  robots?: Metadata["robots"];
  /** Skip hreflang alternates (single-language tool pages). */
  noAlternates?: boolean;
};

/** Metadata for a game page: canonical + hreflang per supported locale, OG. */
export function pageMetadata({
  game,
  lang,
  path,
  title,
  description = game.seo.defaultDescription,
  image,
  robots,
  noAlternates,
}: PageMetaInput & { game: GameDefinition; lang: Lang; path: string }): Metadata {
  const languages = Object.fromEntries(game.locales.map((l) => [l, gameHref(game, l, path)]));
  return {
    title,
    description,
    ...(robots ? { robots } : {}),
    ...(noAlternates
      ? {}
      : { alternates: { canonical: gameHref(game, lang, path), languages } }),
    openGraph: {
      title,
      description,
      siteName: "Gildra",
      type: "website",
      ...(image ? { images: [image] } : {}),
    },
  };
}
