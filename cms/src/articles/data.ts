import { Forbidden, type Endpoint, type PayloadRequest, type Where } from "payload";
import { canUseAdmin, isOwner, relationID, siteIDsWithRole, SITE_ROLES } from "../access/roles";
import { writableSites } from "../admin/siteChoice";
import { stateLevel, localeState } from "../admin/completeness";
import { articleUrl } from "../admin/sitePaths";
import { PAGE_SIZE, optionalID, type PageResult, type SiteChoice } from "../components/workspace/query";
import { json } from "../utilities/http";
import { articlesSearchParams, normalizeArticlesQuery } from "./query";

export type ArticleRow = { id: string; title: string; slug: string; siteID: string; siteName: string;
  status: "draft" | "published"; live: boolean; liveUrl: string | null; updatedAt: string; href: string };
export type ArticlesResult = PageResult<ArticleRow> & { sites: SiteChoice[]; writable: string[]; locale: "en" | "ru" };
type Params = { site?: unknown; q?: unknown; page?: unknown; status?: unknown; locale?: unknown };

export async function articlesData(req: PayloadRequest, params: Params): Promise<ArticlesResult> {
  if (!canUseAdmin(req.user)) throw new Forbidden(req.t);
  // SSR and the endpoint must reject/fallback repeated parameters identically.
  const query = normalizeArticlesQuery(params, req.locale === "en" ? "en" : "ru");
  const { locale } = query;
  const scope = isOwner(req.user) ? null : siteIDsWithRole(req.user, SITE_ROLES);
  const foundSites = await req.payload.find({ collection: "sites", req, user: req.user, overrideAccess: false,
    depth: 0, pagination: false, select: { name: true, slug: true, publicUrl: true }, sort: "name",
    ...(scope ? { where: { id: { in: scope } } } : {}) });
  const siteMap = new Map(foundSites.docs.map((s) => [String(s.id), s]));
  const site = optionalID(query.site);
  if (query.site !== "" && (!site || !siteMap.has(site))) throw new Forbidden(req.t);
  const filters: Where[] = [{ site: { in: foundSites.docs.map((s) => s.id) } }];
  if (site) filters.push({ site: { equals: site } });
  const q = query.q;
  if (q) filters.push({ or: [{ title: { contains: q } }, { slug: { contains: q } }] });
  if (query.status) filters.push({ _status: { equals: query.status } });
  const result = await req.payload.find({ collection: "guides", req, user: req.user, overrideAccess: false,
    depth: 0, draft: true, locale, fallbackLocale: false, where: { and: filters }, limit: PAGE_SIZE,
    page: query.page, sort: ["-updatedAt", "id"],
    select: { title: true, slug: true, site: true, _status: true, updatedAt: true } });
  // Live links come from the published document, never from an unsaved slug or
  // a translation that exists only in the latest draft.
  const published = result.docs.length ? await req.payload.find({ collection: "guides", req, user: req.user,
    overrideAccess: false, depth: 0, draft: false, locale, fallbackLocale: false, pagination: false,
    where: { and: [{ id: { in: result.docs.map((d) => d.id) } }, { _status: { equals: "published" } }] },
    select: { title: true, summary: true, content: true, slug: true, site: true, _status: true } }) : { docs: [] };
  const byPublished = new Map(published.docs.map((d) => [String(d.id), d]));
  const writable = await writableSites(req.payload, req.user, "guides");
  return { rows: result.docs.map((doc) => {
    const siteID = String(relationID(doc.site));
    const live = byPublished.get(String(doc.id));
    const sourceSite = siteMap.get(siteID);
    return { id: String(doc.id), title: doc.title || "", slug: doc.slug, siteID,
      siteName: sourceSite?.name ?? "—", status: doc._status === "published" ? "published" : "draft",
      live: Boolean(live), liveUrl: live && sourceSite && stateLevel(localeState(live), "guides") === "complete" ? articleUrl(sourceSite, live.slug, locale) : null,
      updatedAt: doc.updatedAt, href: `/admin/collections/guides/${doc.id}?locale=${locale}` };
  }), page: result.page ?? 1, totalDocs: result.totalDocs, totalPages: result.totalPages,
    sites: foundSites.docs.map((s) => ({ id: String(s.id), name: s.name })), writable: writable.map((s) => String(s.id)), locale };
}

export const articlesEndpoint: Endpoint = { path: "/admin/articles", method: "get", handler: async (req) => {
  return json(await articlesData(req, articlesSearchParams(req.searchParams)));
} };
