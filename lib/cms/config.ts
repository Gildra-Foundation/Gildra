/**
 * Server-side CMS settings for gildra.net. Nothing here is exposed to the
 * browser (no NEXT_PUBLIC_ variables).
 *
 *   CMS_INTERNAL_URL     server-to-server origin of the shared Payload CMS (unset = CMS off)
 *   CMS_SITE_SLUG        tenant served by this frontend (default "gildra")
 *   CMS_PUBLIC_URL       public CMS origin used in media URLs (default CMS_INTERNAL_URL)
 *   CMS_MEDIA_ORIGINS    extra allowed image origins, comma separated
 *   CMS_REVALIDATE_SECONDS  fetch cache lifetime (default 300)
 *   CMS_REVALIDATE_SECRET   HMAC secret for /api/cms/revalidate
 *   CMS_READERS_ENABLED  "1" to expose the opt-in reader pages and proxy
 *   SITE_PUBLIC_ORIGIN   exact origin for reader CSRF checks (default https://gildra.net)
 */
export type CmsConfig = {
  enabled: boolean;
  internalUrl: string;
  site: string;
  publicUrl: string;
  mediaOrigins: string[];
  revalidateSeconds: number;
  readersEnabled: boolean;
  publicOrigin: string;
};

const trimSlash = (value: string) => value.replace(/\/+$/, "");

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function cmsConfig(env: Record<string, string | undefined> = process.env): CmsConfig {
  const internalUrl = trimSlash(env.CMS_INTERNAL_URL ?? "");
  const publicUrl = trimSlash(env.CMS_PUBLIC_URL || internalUrl);
  const site = (env.CMS_SITE_SLUG || "gildra").trim();
  const mediaOrigins = [publicUrl, ...(env.CMS_MEDIA_ORIGINS ?? "").split(",")]
    .map((v) => originOf(v.trim()))
    .filter((v): v is string => Boolean(v));
  const enabled = Boolean(originOf(internalUrl)) && /^[a-z0-9-]{2,40}$/.test(site);
  return {
    enabled,
    internalUrl,
    site,
    publicUrl,
    mediaOrigins: [...new Set(mediaOrigins)],
    revalidateSeconds: Math.max(10, Number(env.CMS_REVALIDATE_SECONDS) || 300),
    readersEnabled: enabled && env.CMS_READERS_ENABLED === "1",
    publicOrigin: originOf(env.SITE_PUBLIC_ORIGIN ?? "") ?? "https://gildra.net",
  };
}

export const isCmsEnabled = () => cmsConfig().enabled;
export const isReaderEnabled = () => cmsConfig().readersEnabled;
