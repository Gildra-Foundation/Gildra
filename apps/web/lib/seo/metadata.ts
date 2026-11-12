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
    ...(CARDLESS.test(page.path) ? { images: [SITE_CARD] } : {}),
  };
}

/**
 * Page families without link-preview cards of their own (the inner pages of Forever and Mists, a player, a Mythic+ run,
 * the places of the world map) show the site's card: a page's `openGraph` drops the card
 * inherited from the section above, and a preview without a picture is a bare link. Their hubs
 * and every other family have an opengraph-image route; naming `images` here would replace it,
 * so only these paths get one.
 */
const CARDLESS = /^(?:\/ru)?\/wow\/(?:(?:forever|mists|map|players)\/.|mythic-plus\/routes\/.)/;
const SITE_CARD = { url: "/brand/og-card.png", width: 1200, height: 630, alt: "WowArcana — World of Warcraft", type: "image/png" };

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

/** A meta description within a search result's length, cut at a word instead of in the middle of one. */
export function clipDescription(text: string, limit = 160) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), limit - 40)).replace(/[\s,.;:–—-]+$/, "")}…`;
}
