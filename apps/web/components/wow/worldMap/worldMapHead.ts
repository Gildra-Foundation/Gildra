import type { Lang } from "@/lib/wow/worldMap/bundle";

/**
 * The page head after the viewer moves to another map without a page load
 * (search, a click, Back): title, description, canonical and language links,
 * Open Graph and the breadcrumb JSON-LD describe the map now shown — the same
 * values the server renders for that map's own page.
 */
export type HeadState = { lang: Lang; title: string; description: string; path: string; crumbs: Array<{ label: string; href?: string }> };

const ORIGIN = "https://gildra.net";

/** Path of a page in both languages (the site's canonical scheme: EN at the root, RU under /ru). */
export function headLinks(path: string) {
  const en = path, ru = path === "/" ? "/ru" : `/ru${path}`;
  return { en: `${ORIGIN}${en}`, ru: `${ORIGIN}${ru}`, xDefault: `${ORIGIN}${en}` };
}

export function breadcrumbLd(crumbs: HeadState["crumbs"]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem", position: index + 1, name: crumb.label,
      ...(crumb.href && index < crumbs.length - 1 ? { item: `${ORIGIN}${crumb.href}` } : {}),
    })),
  };
}

const setAttr = (selector: string, attr: string, value: string) => {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
};

export function syncHead(state: HeadState) {
  const links = headLinks(state.path);
  const canonical = state.lang === "ru" ? links.ru : links.en;
  if (document.title !== state.title) document.title = state.title;
  setAttr('meta[name="description"]', "content", state.description);
  setAttr('link[rel="canonical"]', "href", canonical);
  setAttr('link[rel="alternate"][hreflang="en"]', "href", links.en);
  setAttr('link[rel="alternate"][hreflang="ru"]', "href", links.ru);
  setAttr('link[rel="alternate"][hreflang="x-default"]', "href", links.xDefault);
  setAttr('meta[property="og:title"]', "content", state.title);
  setAttr('meta[property="og:description"]', "content", state.description);
  setAttr('meta[property="og:url"]', "content", canonical);
  setAttr('meta[name="twitter:title"]', "content", state.title);
  setAttr('meta[name="twitter:description"]', "content", state.description);
  const ld = document.querySelector('main script[type="application/ld+json"]');
  if (ld) ld.textContent = JSON.stringify(breadcrumbLd(state.crumbs));
}
