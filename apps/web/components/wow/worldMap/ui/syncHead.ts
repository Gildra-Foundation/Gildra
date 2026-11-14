import type { Lang } from "@/lib/wow/worldMap/bundle";
import type { StageCrumb } from "../WorldMapStage";
import { worldMapCopy } from "../worldMapCopy";

/**
 * The viewer moves between maps without a page load: the head follows, so the
 * title, description, canonical, hreflang, Open Graph and the breadcrumb data
 * describe the map in the address bar (the server writes the same for a fresh load).
 */
export function syncHead(lang: Lang, crumbs: StageCrumb[], homeId: number | null, line: string) {
  const copy = worldMapCopy[lang];
  // The page is the deepest map of the trail that has one (caves and keeps live on their zone's page).
  const index = crumbs.findLastIndex((crumb, i) => i > 0 && crumb.href);
  const page = crumbs[index];
  if (!page?.href) return;
  const home = page.mapId === undefined || page.mapId === homeId;
  const title = home ? copy.rootTitle : copy.pageTitle(page.label);
  const description = home ? copy.rootDescription : line || copy.rootDescription;
  const path = page.href;
  const en = lang === "ru" ? path.replace(/^\/ru(?=\/|$)/, "") || "/" : path;
  const ru = lang === "ru" ? path : `/ru${path}`;
  const origin = window.location.origin;
  const set = (selector: string, attr: string, value: string) => { const el = document.head.querySelector(selector); if (el && el.getAttribute(attr) !== value) el.setAttribute(attr, value); };
  if (document.title !== title) document.title = title;
  set('meta[name="description"]', "content", description);
  set('link[rel="canonical"]', "href", origin + path);
  set('link[rel="alternate"][hreflang="en"]', "href", origin + en);
  set('link[rel="alternate"][hreflang="ru"]', "href", origin + ru);
  set('link[rel="alternate"][hreflang="x-default"]', "href", origin + en);
  set('meta[property="og:title"]', "content", title);
  set('meta[property="og:description"]', "content", description);
  set('meta[property="og:url"]', "content", origin + path);
  // Every card format the server writes for a page: X/Twitter repeats the title and description.
  set('meta[name="twitter:title"]', "content", title);
  set('meta[name="twitter:description"]', "content", description);
  set('meta[name="twitter:url"]', "content", origin + path);
  const ld = document.getElementById("world-map-trail");
  if (ld) {
    const trail = crumbs.slice(0, index + 1);
    const data = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: trail.map((crumb, i) => ({
        "@type": "ListItem", position: i + 1, name: crumb.label,
        ...(crumb.href && i < trail.length - 1 ? { item: `${origin}${crumb.href}` } : {}),
      })),
    };
    const text = JSON.stringify(data).replace(/</g, "\\u003c");
    if (ld.textContent !== text) ld.textContent = text;
  }
}
