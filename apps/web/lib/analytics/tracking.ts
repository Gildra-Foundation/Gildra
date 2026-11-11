import { SITE_ORIGIN } from "../seo/site.ts";

/** Preview and non-production hosts must not contribute to the site's audience. */
export const PREVIEW_EXCLUSIONS = '/preview,/en/preview,/ru/preview,/cms-preview,/ru/cms-preview,/en/cms-preview';

// The Plausible site ID may retain the old domain after a migration. It is not a host allowlist.
export function isTrackedPage(hostname: string, pathname: string | null, siteOrigin = SITE_ORIGIN): boolean {
  const domain = new URL(siteOrigin).hostname;
  if (!pathname || ![domain, `www.${domain}`].includes(hostname.toLowerCase())) return false;
  return !/^\/(?:en\/|ru\/)?(?:preview|cms-preview)(?:\/|$)/.test(pathname);
}

/** Our pinned Plausible CE supports the exclusions extension, including History API navigations. */
export function exclusionScript(src: string): string {
  const url = new URL(src);
  if (!url.pathname.includes('.exclusions.')) url.pathname = url.pathname.replace(/\.js$/, '.exclusions.js');
  return url.toString();
}
