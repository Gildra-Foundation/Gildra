/** Preview and non-production hosts must not contribute to the site's audience. */
export const PREVIEW_EXCLUSIONS = '/preview,/en/preview,/ru/preview,/cms-preview,/ru/cms-preview,/en/cms-preview';

export function isTrackedPage(hostname: string, domain: string, pathname: string | null): boolean {
  if (!pathname || ![domain, `www.${domain}`].includes(hostname.toLowerCase())) return false;
  return !/^\/(?:en\/|ru\/)?(?:preview|cms-preview)(?:\/|$)/.test(pathname);
}

/** Our pinned Plausible CE supports the exclusions extension, including History API navigations. */
export function exclusionScript(src: string): string {
  const url = new URL(src);
  if (!url.pathname.includes('.exclusions.')) url.pathname = url.pathname.replace(/\.js$/, '.exclusions.js');
  return url.toString();
}
