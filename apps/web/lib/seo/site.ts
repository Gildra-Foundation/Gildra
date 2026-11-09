/** Shared canonical origin for metadata, structured data and every sitemap. */
export const SITE_ORIGIN = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://wowarcana.com").origin;
