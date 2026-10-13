/**
 * Structured data (schema.org JSON-LD) for search engines. Server components
 * render it next to the page content (Next.js guide "JSON-LD"); every value
 * comes from the page's own data — nothing here is invented for search.
 */
import type { PublicArticle } from "@/lib/cms/contract";

/** Canonical origin of the site (the `metadataBase` of app/root-document.tsx). */
export const SITE_ORIGIN = "https://gildra.net";

export const absoluteUrl = (path: string) => new URL(path, SITE_ORIGIN).href;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };
export type JsonLdThing = { "@context"?: "https://schema.org"; "@type": string; [key: string]: Json | undefined };

/** `<script type="application/ld+json">`; `<` is escaped so CMS text can never close the tag. */
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

/** Article of the shared CMS, as published (headline ≤ 110 characters, as Google reads it). */
export function articleLd(article: PublicArticle, path: string, image: string | null): JsonLdThing {
  const headline = (article.seo.title || article.title || article.slug).slice(0, 110);
  const modified = article.updatedAt ?? article.publishedAt;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description: article.seo.description || article.summary || undefined,
    url: absoluteUrl(path),
    mainEntityOfPage: absoluteUrl(path),
    inLanguage: article.resolvedLocale ?? undefined,
    datePublished: article.publishedAt ?? undefined,
    dateModified: modified ?? undefined,
    // A byline of the editors themselves ("Gildra", "Gildra editors") is the organisation, not a person.
    author: article.author?.name && !/^gildra\b/i.test(article.author.name) ? { "@type": "Person", name: article.author.name } : gildraOrganization(),
    publisher: gildraOrganization(),
    image: image ? [image] : undefined,
    articleSection: article.categories[0]?.title,
    keywords: article.tags.length ? article.tags.map((tag) => tag.title).join(", ") : undefined,
    isAccessibleForFree: true,
  };
}
