import "server-only";

import { cmsConfig } from "./config";
import type { CmsLocale, PublicArticle } from "./contract";

/**
 * Draft article for the in-design preview (`/cms-preview`). The signed token
 * from the CMS admin (staff user, document, site, expiry) is verified by the
 * CMS itself; the answer is never cached.
 */
export type PreviewResult = { status: "ok"; article: PublicArticle } | { status: "disabled" | "invalid" | "not-found" | "error" };

const TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const TIMEOUT_MS = 4000;

export async function fetchArticlePreview(token: string | undefined, locale: CmsLocale): Promise<PreviewResult> {
  const config = cmsConfig();
  if (!config.enabled) return { status: "disabled" };
  if (!token || token.length > 2048 || !TOKEN.test(token)) return { status: "invalid" };
  try {
    const response = await fetch(`${config.internalUrl}/api/preview-content?${new URLSearchParams({ token, locale, site: config.site })}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) return { status: "invalid" };
    if (response.status === 404) return { status: "not-found" };
    if (!response.ok) return { status: "error" };
    const body = (await response.json()) as { collection?: unknown; site?: { slug?: unknown }; doc?: PublicArticle };
    if (body.collection !== "guides" || body.site?.slug !== config.site || !body.doc) return { status: "not-found" };
    return { status: "ok", article: body.doc };
  } catch {
    return { status: "error" };
  }
}

/** Origin of the CMS admin: the only sender whose save signals the preview accepts. */
export function cmsOrigin(): string | null {
  try {
    return new URL(cmsConfig().publicUrl).origin;
  } catch {
    return null;
  }
}
