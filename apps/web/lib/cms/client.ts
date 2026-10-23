import "server-only";

import { cache as perRequest } from "react";
import type { CmsLocale, PublicArticle, PublicArticleList, PublicPage } from "./contract";
import { cmsConfig } from "./config";
import { cmsTags } from "./revalidation";

/**
 * Reads the shared CMS public projection for this site only. Every request
 * names the site and locale explicitly; the CMS returns published versions
 * only. Results are cached with tags that /api/cms/revalidate invalidates.
 */
export type CmsResult<T> =
  | { status: "ok"; data: T }
  | { status: "not-found" }
  | { status: "disabled" }
  | { status: "error"; reason: string };

const TIMEOUT_MS = 4000;

async function cmsGet<T>(path: string, params: Record<string, string>, tags: string[]): Promise<CmsResult<T>> {
  const config = cmsConfig();
  if (!config.enabled) return { status: "disabled" };
  const url = `${config.internalUrl}/api/public/${encodeURIComponent(config.site)}${path}?${new URLSearchParams(params)}`;
  return requestCms(url, config.revalidateSeconds, tags.join("\n")) as Promise<CmsResult<T>>;
}

// The timeout signal opts every CMS fetch out of Next's request dedupe, so the
// article read by generateMetadata and by the page is shared within a request.
const requestCms = perRequest(async (url: string, revalidate: number, tags: string): Promise<CmsResult<unknown>> => {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate, tags: tags.split("\n") },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return { status: "not-found" };
    if (!response.ok) return { status: "error", reason: `http-${response.status}` };
    return { status: "ok", data: await response.json() };
  } catch (error) {
    return { status: "error", reason: (error as Error).name || "fetch-failed" };
  }
});

export async function fetchArticles(locale: CmsLocale, page = 1, limit = 24): Promise<CmsResult<PublicArticleList>> {
  const { site } = cmsConfig();
  return cmsGet<PublicArticleList>(
    "/articles",
    { locale, page: String(page), limit: String(Math.min(50, Math.max(1, limit))) },
    [cmsTags.articles(site), cmsTags.taxonomy(site)],
  );
}

export async function fetchArticle(slug: string, locale: CmsLocale): Promise<CmsResult<PublicArticle>> {
  const { site } = cmsConfig();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160) return { status: "not-found" };
  return cmsGet<PublicArticle>(`/articles/${encodeURIComponent(slug)}`, { locale }, [
    cmsTags.article(site, slug),
    cmsTags.taxonomy(site),
  ]);
}

export async function fetchPage(slug: string, locale: CmsLocale): Promise<CmsResult<PublicPage>> {
  const { site } = cmsConfig();
  return cmsGet<PublicPage>("/page", { slug, locale }, [cmsTags.pages(site), cmsTags.page(site, slug)]);
}
