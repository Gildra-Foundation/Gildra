import type { AtlasCrumb } from "./AtlasBreadcrumbs";

/** Canonical origin the BreadcrumbList resolves relative links against (the site's metadataBase). */
export const SITE_ORIGIN = "https://gildra.net";

/**
 * schema.org BreadcrumbList of the visible trail, so search results show the
 * same path. Linked crumbs carry their absolute URL; the current page may go
 * without one (Google takes the page URL).
 */
export function breadcrumbJsonLd(items: AtlasCrumb[], origin = SITE_ORIGIN) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href && !item.href.startsWith("#") ? { item: new URL(item.href, origin).href } : {}),
    })),
  };
}
