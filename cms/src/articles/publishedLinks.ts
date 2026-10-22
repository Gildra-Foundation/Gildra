import { Forbidden, type Endpoint, type PayloadRequest } from "payload";
import { canUseAdmin } from "../access/roles";
import { CONTENT_LOCALES, localeState, stateLevel } from "../admin/completeness";
import { articleUrl } from "../admin/sitePaths";
import { json } from "../utilities/http";

export type PublishedLink = { code: string; short: string; url: string };

export async function publishedArticleLinks(req: PayloadRequest, id: string): Promise<PublishedLink[]> {
  if (!canUseAdmin(req.user)) throw new Forbidden(req.t);
  if (!/^\d{1,15}$/.test(id)) return [];
  const doc = await req.payload.findByID({ collection: "guides", id, req, user: req.user,
    overrideAccess: false, draft: false, locale: "all", fallbackLocale: false, disableErrors: true, depth: 1,
    select: { title: true, summary: true, content: true, slug: true, site: true, _status: true },
    populate: { sites: { slug: true, publicUrl: true } } });
  if (!doc || doc._status !== "published" || !doc.site || typeof doc.site !== "object") return [];
  const localized = doc as unknown as { title?: Record<string, unknown>; summary?: Record<string, unknown>; content?: Record<string, unknown> };
  return CONTENT_LOCALES.flatMap((locale) => {
    const state = localeState({ title: localized.title?.[locale.code], summary: localized.summary?.[locale.code], content: localized.content?.[locale.code] });
    const url = stateLevel(state, "guides") === "complete" ? articleUrl(doc.site as { slug?: unknown; publicUrl?: unknown }, doc.slug, locale.code) : null;
    return url ? [{ code: locale.code, short: locale.short, url }] : [];
  });
}

export const articleLinksEndpoint: Endpoint = { path: "/admin/article-links", method: "get", handler: async (req) =>
  json({ links: await publishedArticleLinks(req, req.searchParams.get("id") ?? "") }),
};
