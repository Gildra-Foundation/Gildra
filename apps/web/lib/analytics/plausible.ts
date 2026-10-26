/**
 * Public Plausible CE tracker settings (server-controlled, opt-in).
 *
 *   PLAUSIBLE_SCRIPT_URL   full URL of the CE tracker, e.g. https://plausible.example.net/js/script.js
 *   PLAUSIBLE_SITE_DOMAIN  site id registered in Plausible CE, e.g. gildra.net
 *   PLAUSIBLE_API_URL      optional event endpoint (`data-api`), a same-site path such as
 *                          /stats/api/event or an https URL; lets the site proxy Plausible
 *                          under its own domain instead of exposing the CE host
 *   PLAUSIBLE_TRACKING=off disables the tracker without removing the settings
 *
 * Only these public values reach the page. The standard `script.js` follows History
 * API navigations, so Next client-side route changes are counted as pageviews.
 * The tracker renders in production builds only, so local dev/tests send nothing.
 */
export type TrackerConfig = { src: string; domain: string; api?: string } | null;

/** `data-api` value: a root-relative path or an https URL whose path ends in /event. */
function eventEndpoint(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("/")) return /^\/[a-z0-9/_-]*\/event$/.test(raw) && !raw.includes("//") ? raw : null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && url.pathname.endsWith("/event") ? url.href : null;
  } catch {
    return null;
  }
}

export function plausibleTracker(env: Record<string, string | undefined> = process.env): TrackerConfig {
  if (env.NODE_ENV !== "production" || env.PLAUSIBLE_TRACKING === "off") return null;
  const domain = (env.PLAUSIBLE_SITE_DOMAIN ?? "").trim();
  if (!/^[a-z0-9.-]{3,253}$/.test(domain)) return null;
  let url: URL;
  try {
    url = new URL(env.PLAUSIBLE_SCRIPT_URL ?? "");
  } catch {
    return null;
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
  if (url.username || url.password || !/\/js\/[a-z0-9.-]+\.js$/.test(url.pathname)) return null;
  if (!env.PLAUSIBLE_API_URL) return { src: url.href, domain };
  // A configured but invalid endpoint disables tracking instead of silently posting elsewhere.
  const api = eventEndpoint(env.PLAUSIBLE_API_URL);
  return api ? { src: url.href, domain, api } : null;
}
