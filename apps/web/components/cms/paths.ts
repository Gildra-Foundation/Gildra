import type { CmsLocale } from "@/lib/cms/contract";
import type { Lang } from "@/lib/i18n";

/** Public article URLs on gildra.net: /wow/articles/<slug> and /ru/wow/articles/<slug>. */
export const ARTICLES_PATH = "/wow/articles";

export const articlesIndexHref = (lang: Lang | CmsLocale) => (lang === "ru" ? `/ru${ARTICLES_PATH}` : ARTICLES_PATH);
export const articleHref = (lang: Lang | CmsLocale, slug: string) => `${articlesIndexHref(lang)}/${slug}`;

/** Site-relative CMS links follow the reader's language; already-localised paths stay as they are. */
export function localizeSitePath(lang: Lang, href: string): string {
  if (lang !== "ru" || !href.startsWith("/") || href === "/ru" || href.startsWith("/ru/") || href.startsWith("/ru?") || href.startsWith("/ru#")) {
    return href;
  }
  return href === "/" ? "/ru" : `/ru${href}`;
}
