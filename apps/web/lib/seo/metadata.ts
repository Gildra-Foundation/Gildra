import type { Metadata } from "next";
import type { Lang as Locale } from "@/lib/i18n-paths";


/**
 * Open Graph of one page: its own title, description, canonical URL and
 * language. A page's `openGraph` replaces the layout's whole object, so the
 * site name and type are repeated here; the image comes from the route's
 * opengraph-image file.
 */
export function pageOpenGraph(locale: Locale, page: { title: string; description?: string; path: string; type?: "website" | "article" }): NonNullable<Metadata["openGraph"]> {
  return {
    siteName: "WowArcana",
    type: page.type ?? "website",
    locale: locale === "ru" ? "ru_RU" : "en_US",
    title: page.title,
    ...(page.description ? { description: page.description } : {}),
    url: page.path,
  };
}

/** Canonical + hreflang of a page that exists at `path` and `/ru${path}`. */
export function pairedAlternates(locale: Locale, path: string): NonNullable<Metadata["alternates"]> {
  const ru = path === "/" ? "/ru" : `/ru${path}`;
  return { canonical: locale === "ru" ? ru : path, languages: { en: path, ru, "x-default": path } };
}

/**
 * Adds the page's own Open Graph (title, description, canonical URL, language)
 * to metadata that names only a title, description and canonical. Without it
 * the layout's site-wide og:title/og:url would describe every such page.
 */
export function withPageOpenGraph(locale: Locale, metadata: Metadata): Metadata {
  if (metadata.openGraph) return metadata;
  const title = typeof metadata.title === "string" ? metadata.title : undefined;
  const canonical = metadata.alternates?.canonical;
  if (!title || !canonical) return metadata;
  const description = metadata.description ?? undefined;
  return { ...metadata, openGraph: pageOpenGraph(locale, { title, description, path: String(canonical) }) };
}
