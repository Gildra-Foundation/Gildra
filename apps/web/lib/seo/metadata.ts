import type { Metadata } from "next";

type Locale = "en" | "ru";

/**
 * Open Graph of one page: its own title, description, canonical URL and
 * language. A page's `openGraph` replaces the layout's whole object, so the
 * site name and type are repeated here; the image comes from the route's
 * opengraph-image file.
 */
export function pageOpenGraph(locale: Locale, page: { title: string; description?: string; path: string; type?: "website" | "article" }): NonNullable<Metadata["openGraph"]> {
  return {
    siteName: "Gildra",
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
