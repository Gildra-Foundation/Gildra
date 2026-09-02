/**
 * Canonical console URLs.  The Next.js route is /api-console/[...consolePath]
 * and nginx maps the short api.gildra.net paths (/datasets, /api, /system,
 * /catalog) onto it, so every internal link uses the /api-console prefix and
 * works both behind nginx and on the web origin.
 */
export const CONSOLE_ROOT = "/api-console";

export function consolePath(...segments: (string | undefined | null)[]): string {
  const parts = segments.filter((segment): segment is string => Boolean(segment)).map((segment) => segment.replace(/^\/+|\/+$/g, ""));
  return parts.length ? `${CONSOLE_ROOT}/${parts.join("/")}` : CONSOLE_ROOT;
}

export const datasetPath = (slug?: string, ...rest: string[]) => consolePath("datasets", slug, ...rest);
export const datasetClassPath = (slug: string, classSlug: string) => consolePath("datasets", slug, "classes", classSlug);
