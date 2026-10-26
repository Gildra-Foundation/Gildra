/**
 * Structured data (schema.org JSON-LD) for search engines. Server components
 * render it next to the page content (Next.js guide "JSON-LD"); every value
 * comes from the page's own data — nothing here is invented for search.
 */
/** Canonical origin of the site (the `metadataBase` of app/root-document.tsx). */
export const SITE_ORIGIN = "https://gildra.net";

export const absoluteUrl = (path: string) => new URL(path, SITE_ORIGIN).href;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };
export type JsonLdThing = { "@context"?: "https://schema.org"; "@type": string; [key: string]: Json | undefined };

/** `<script type="application/ld+json">`; `<` is escaped so page text can never close the tag. */
export function JsonLd({ data }: { data: JsonLdThing | JsonLdThing[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const gildraOrganization = (): JsonLdThing => ({
  "@type": "Organization",
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
      name: "Gildra",
      url: absoluteUrl(locale === "ru" ? "/ru" : "/"),
      inLanguage: locale,
      description,
      publisher: gildraOrganization(),
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
