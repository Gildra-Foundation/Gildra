/**
 * Structured data (schema.org JSON-LD) for search engines. Server components
 * render it next to the page content (Next.js guide "JSON-LD"); every value
 * comes from the page's own data — nothing here is invented for search.
 */
/** Canonical origin of the site (the `metadataBase` of app/root-document.tsx). */
import { SITE_ORIGIN } from "./site";
export { SITE_ORIGIN } from "./site";

export const absoluteUrl = (path: string) => new URL(path, SITE_ORIGIN).href;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };
export type JsonLdThing = { "@context"?: "https://schema.org"; "@type": string; [key: string]: Json | undefined };


export const gildraOrganization = (): JsonLdThing => ({
  "@type": "Organization",
  "@id": absoluteUrl("/#organization"),
  name: "Gildra",
  url: absoluteUrl("/"),
  logo: { "@type": "ImageObject", url: absoluteUrl("/brand/helmet.png"), width: 396, height: 512 },
});

/** WebSite + Organization of the home page in one language. */
export function websiteLd(locale: "en" | "ru", description: string): JsonLdThing[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": absoluteUrl(locale === "ru" ? "/ru#website" : "/#website"),
      name: "Gildra",
      url: absoluteUrl(locale === "ru" ? "/ru" : "/"),
      inLanguage: locale,
      description,
      publisher: gildraOrganization(),
      // Describe the site search visible to readers.
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl(locale === "ru" ? "/ru/search" : "/search")}?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    { "@context": "https://schema.org", ...gildraOrganization() },
  ];
}

/** BreadcrumbList from the atlas breadcrumbs (`trail()`); the current page may have no href. */
export function breadcrumbListLd(items: ReadonlyArray<{ label: string; href?: string }>, currentPath?: string): JsonLdThing {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((crumb, index) => {
      const href = crumb.href ?? (index === items.length - 1 ? currentPath : undefined);
      return { "@type": "ListItem", position: index + 1, name: crumb.label, ...(href ? { item: absoluteUrl(href) } : {}) };
    }),
  };
}

/**
 * ItemList of a ranked or browsable list on the page (tier list, leaderboard,
 * professions, classes): only names and links the page itself shows.
 */
export function itemListLd(name: string, items: ReadonlyArray<{ name: string; href?: string }>, ordered = true): JsonLdThing {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListOrder: ordered ? "https://schema.org/ItemListOrderAscending" : "https://schema.org/ItemListUnordered",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, ...(item.href ? { url: absoluteUrl(item.href) } : {}) })),
  };
}
