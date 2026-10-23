/**
 * CMS uploads that Next's image optimizer may fetch (`images.remotePatterns`
 * in next.config.ts). Exact origin and upload path, no wildcards; any other
 * allow-listed media origin is rendered unoptimized.
 */
export const CMS_IMAGE_ORIGINS = ["https://cms.gildra.net"] as const;
export const CMS_IMAGE_PATH = "/api/media/file/";

/** Whether an already allow-listed media URL goes through the optimizer. */
export function isOptimizableCmsImage(src: string): boolean {
  try {
    const url = new URL(src);
    return (CMS_IMAGE_ORIGINS as readonly string[]).includes(url.origin) && url.pathname.startsWith(CMS_IMAGE_PATH) && !url.pathname.endsWith(".gif");
  } catch {
    // Same-site paths (fixtures, public/) are always optimizable.
    return src.startsWith("/") && !src.startsWith("//");
  }
}
