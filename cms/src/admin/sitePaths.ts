/**
 * Public article URLs of the network sites, as their frontends route them:
 *   gildra.net   EN /wow/articles/<slug>   RU /ru/wow/articles/<slug>
 *   riftden.com  RU /articles/<slug>       EN /en/articles/<slug>
 * Client-safe (no server imports). Unknown sites get no link instead of a guess.
 */
const ARTICLE_PREFIX: Record<string, Record<string, string>> = {
  gildra: { en: "/wow/articles/", ru: "/ru/wow/articles/" },
  riftden: { ru: "/articles/", en: "/en/articles/" },
};

export function articleUrl(site: { slug?: unknown; publicUrl?: unknown }, slug: string, locale: string): string | null {
  const prefix = typeof site.slug === "string" ? ARTICLE_PREFIX[site.slug]?.[locale] : undefined;
  if (!prefix || !slug || typeof site.publicUrl !== "string") return null;
  try {
    return new URL(`${prefix}${encodeURIComponent(slug)}`, site.publicUrl).toString();
  } catch {
    return null;
  }
}
