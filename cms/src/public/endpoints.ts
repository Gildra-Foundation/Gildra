import type { Endpoint, PayloadRequest, Where } from "payload";

import { asStaff, hasSiteRole, type ID, PUBLISH_ROLES, relationID, sameID, WRITE_ROLES } from "../access/roles";
import { verifyPreview } from "../preview/token";
import { json, type Locale, parseLocale } from "../utilities/http";
import { availableLocales, buildResolver, projectArticle, projectPage, projectTerm, PUBLIC_LOCALES, type PublicTerm, resolveLocale } from "./projection";

/**
 * Read-only public API for the site frontends:
 *
 *   GET /api/public/:site/articles?locale=ru&page=1&limit=20&category=raid&tag=…
 *   GET /api/public/:site/articles/:slug?locale=ru
 *   GET /api/public/:site/page?slug=wow/home&locale=ru
 *   GET /api/public/:site/settings?locale=ru
 *   GET /api/public/:site/taxonomy?locale=ru
 *   GET /api/public/profiles/:handle
 *   GET /api/preview-content?token=…   (staff preview of the latest draft)
 *
 * Only published documents of the named site are returned, in an explicit
 * projection. Locale fallback is English.
 */

const PUBLIC_CACHE = { "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" };

type Doc = Record<string, unknown>;
type Site = { id: ID; slug: string; name: string; game: string; publicUrl: string; languages?: string[] | null; defaultLocale?: string | null };

async function siteBySlug(req: PayloadRequest, slug: unknown): Promise<Site | null> {
  if (typeof slug !== "string" || !/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  const { docs } = await req.payload.find({ collection: "sites", where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true });
  return (docs[0] as unknown as Site | undefined) ?? null;
}

function locale(req: PayloadRequest): Locale {
  return parseLocale(req.searchParams.get("locale"));
}

async function authorNames(req: PayloadRequest, docs: Doc[]): Promise<Map<string, string>> {
  const ids = [...new Set(docs.map((d) => relationID(d.author)).filter((id) => id !== null).map(String))];
  if (!ids.length) return new Map();
  const { docs: admins } = await req.payload.find({
    collection: "admins",
    where: { id: { in: ids } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { name: true },
  });
  return new Map(admins.map((a) => [String(a.id), String(a.name ?? "")]));
}

async function termMap(req: PayloadRequest, collection: "categories" | "tags", site: ID, loc: Locale, docs: Doc[]) {
  const ids = [...new Set(docs.flatMap((d) => (Array.isArray(d[collection]) ? (d[collection] as unknown[]) : [])).map((v) => relationID(v)).filter((v) => v !== null).map(String))];
  const map = new Map<string, PublicTerm>();
  if (!ids.length) return map;
  const { docs: terms } = await req.payload.find({
    collection,
    where: { and: [{ id: { in: ids } }, { site: { equals: site } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    locale: loc,
    fallbackLocale: "en",
  });
  for (const term of terms) {
    const projected = projectTerm(term);
    if (projected) map.set(String(term.id), projected);
  }
  return map;
}

/** Project article docs (already filtered by site/status) into the public shape. */
/**
 * Project article docs (already filtered by site/status) into the public
 * shape, with an explicit translation contract:
 *   requestedLocale — what the caller asked for
 *   resolvedLocale  — the locale whose text is actually returned
 *   availableLocales — locales with stored title, summary and body
 * Availability is computed from the same version that is served (the
 * published one publicly, the latest draft in staff preview), so hreflang
 * never claims a translation that does not exist. A missing translation
 * falls back to English, as reads always have.
 */
export async function presentArticles(
  req: PayloadRequest,
  site: ID,
  loc: Locale,
  input: Doc[],
  withContent: boolean,
  { draft = false, user }: { draft?: boolean; user?: unknown } = {},
) {
  let docs = input;
  const ids = docs.map((d) => d.id as ID);
  const byLocale = ids.length
    ? await req.payload.find({
        collection: "guides",
        where: { id: { in: ids } },
        locale: "all",
        depth: 0,
        pagination: false,
        draft,
        ...(user ? { overrideAccess: false, user: user as never } : { overrideAccess: true }),
        select: { title: true, summary: true, content: true },
      })
    : { docs: [] };
  const available = new Map(byLocale.docs.map((d) => [String(d.id), availableLocales(d as unknown as Doc)]));
  const resolved = new Map(ids.map((id) => [String(id), resolveLocale(loc, available.get(String(id)) ?? [])]));

  // Re-read documents whose text must come from another locale, without
  // field-level fallback, so title/summary/body are never mixed across languages.
  const elsewhere = ids.filter((id) => {
    const r = resolved.get(String(id));
    return r !== null && r !== loc;
  });
  if (elsewhere.length) {
    const replacements = new Map<string, Doc>();
    for (const target of PUBLIC_LOCALES) {
      const group = elsewhere.filter((id) => resolved.get(String(id)) === target);
      if (!group.length) continue;
      const found = await req.payload.find({
        collection: "guides",
        where: { id: { in: group } },
        locale: target,
        fallbackLocale: false,
        depth: 0,
        pagination: false,
        draft,
        ...(user ? { overrideAccess: false, user: user as never } : { overrideAccess: true }),
      });
      for (const doc of found.docs) replacements.set(String(doc.id), doc as unknown as Doc);
    }
    docs = docs.map((d) => replacements.get(String(d.id)) ?? d);
  }

  const [names, categories, tags, resolver] = await Promise.all([
    authorNames(req, docs),
    termMap(req, "categories", site, loc, docs),
    termMap(req, "tags", site, loc, docs),
    buildResolver(
      req,
      site,
      withContent ? docs.map((d) => d.content) : [],
      docs.flatMap((d) => [d.hero, (d.seo as Doc | undefined)?.image]),
    ),
  ]);
  return docs.map((doc) => {
    const authorID = relationID(doc.author);
    const withAuthor = { ...doc, author: authorID !== null && names.has(String(authorID)) ? { name: names.get(String(authorID)) } : null };
    return {
      ...projectArticle(withAuthor, resolver, { categories, tags }, withContent),
      requestedLocale: loc,
      resolvedLocale: resolved.get(String(doc.id)) ?? null,
      availableLocales: available.get(String(doc.id)) ?? [],
    };
  });
}

async function termID(req: PayloadRequest, collection: "categories" | "tags", site: ID, slug: string | null): Promise<ID | null | undefined> {
  if (!slug) return undefined;
  const { docs } = await req.payload.find({
    collection,
    where: { and: [{ slug: { equals: slug } }, { site: { equals: site } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return docs[0]?.id ?? null;
}

const listArticles: Endpoint = {
  path: "/public/:site/articles",
  method: "get",
  handler: async (req) => {
    const site = await siteBySlug(req, req.routeParams?.site);
    if (!site) return json({ status: "unknown-site" }, 404);
    const loc = locale(req);
    const page = Math.max(1, Math.min(1000, Number(req.searchParams.get("page")) || 1));
    const limit = Math.max(1, Math.min(50, Number(req.searchParams.get("limit")) || 20));
    const and: Where[] = [{ site: { equals: site.id } }, { _status: { equals: "published" } }];
    for (const [param, collection] of [["category", "categories"], ["tag", "tags"]] as const) {
      const id = await termID(req, collection, site.id, req.searchParams.get(param));
      if (id === null) return json({ docs: [], page, limit, totalDocs: 0, totalPages: 0 }, 200, PUBLIC_CACHE);
      if (id !== undefined) and.push({ [collection]: { in: [id] } });
    }
    const result = await req.payload.find({
      collection: "guides",
      where: { and },
      sort: "-publishedAt",
      page,
      limit,
      depth: 0,
      draft: false,
      overrideAccess: true,
      locale: loc,
      fallbackLocale: "en",
    });
    const docs = await presentArticles(req, site.id, loc, result.docs as unknown as Doc[], false);
    return json({ docs, page: result.page, limit, totalDocs: result.totalDocs, totalPages: result.totalPages }, 200, PUBLIC_CACHE);
  },
};

const getArticle: Endpoint = {
  path: "/public/:site/articles/:slug",
  method: "get",
  handler: async (req) => {
    const site = await siteBySlug(req, req.routeParams?.site);
    if (!site) return json({ status: "unknown-site" }, 404);
    const loc = locale(req);
    const { docs } = await req.payload.find({
      collection: "guides",
      where: { and: [{ site: { equals: site.id } }, { slug: { equals: String(req.routeParams?.slug ?? "") } }, { _status: { equals: "published" } }] },
      limit: 1,
      depth: 0,
      draft: false,
      overrideAccess: true,
      locale: loc,
      fallbackLocale: "en",
    });
    if (!docs[0]) return json({ status: "not-found" }, 404, PUBLIC_CACHE);
    const [article] = await presentArticles(req, site.id, loc, docs as unknown as Doc[], true);
    return json(article, 200, PUBLIC_CACHE);
  },
};

const getPage: Endpoint = {
  path: "/public/:site/page",
  method: "get",
  handler: async (req) => {
    const site = await siteBySlug(req, req.routeParams?.site);
    if (!site) return json({ status: "unknown-site" }, 404);
    const slug = req.searchParams.get("slug");
    if (!slug) return json({ status: "invalid", field: "slug" }, 400);
    const loc = locale(req);
    const { docs } = await req.payload.find({
      collection: "pages",
      where: { and: [{ site: { equals: site.id } }, { slug: { equals: slug } }, { _status: { equals: "published" } }] },
      limit: 1,
      depth: 0,
      draft: false,
      overrideAccess: true,
      locale: loc,
      // No fallback: a language without its own blocks keeps the site's code
      // page instead of showing the other language's text.
      fallbackLocale: false,
    });
    const doc = docs[0] as unknown as Doc | undefined;
    if (!doc) return json({ status: "not-found" }, 404, PUBLIC_CACHE);
    const resolver = await buildResolver(req, site.id, [doc.content], [(doc.seo as Doc | undefined)?.image]);
    return json(projectPage(doc, resolver), 200, PUBLIC_CACHE);
  },
};

const getSettings: Endpoint = {
  path: "/public/:site/settings",
  method: "get",
  handler: async (req) => {
    const site = await siteBySlug(req, req.routeParams?.site);
    if (!site) return json({ status: "unknown-site" }, 404);
    const loc = locale(req);
    const { docs } = await req.payload.find({
      collection: "site-settings",
      where: { site: { equals: site.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      locale: loc,
      fallbackLocale: "en",
    });
    const settings = docs[0] as unknown as Doc | undefined;
    const seo = (settings?.defaultSeo ?? {}) as Doc;
    const resolver = await buildResolver(req, site.id, [], [seo.image]);
    const links = (value: unknown) =>
      (Array.isArray(value) ? value : []).map((row) => ({ label: (row as Doc).label ?? null, href: (row as Doc).href ?? null }));
    return json(
      {
        site: { slug: site.slug, name: site.name, game: site.game, publicUrl: site.publicUrl, languages: site.languages ?? [], defaultLocale: site.defaultLocale ?? "en" },
        configured: Boolean(settings),
        siteTitle: settings?.siteTitle ?? null,
        tagline: settings?.tagline ?? null,
        navigation: links(settings?.navigation),
        footerLinks: links(settings?.footerLinks),
        social: (Array.isArray(settings?.social) ? (settings!.social as Doc[]) : []).map((row) => ({ platform: row.platform, url: row.url })),
        defaultSeo: {
          title: seo.title ?? null,
          description: seo.description ?? null,
          image: resolver.media.get(String(relationID(seo.image))) ?? null,
        },
      },
      200,
      PUBLIC_CACHE,
    );
  },
};

const getTaxonomy: Endpoint = {
  path: "/public/:site/taxonomy",
  method: "get",
  handler: async (req) => {
    const site = await siteBySlug(req, req.routeParams?.site);
    if (!site) return json({ status: "unknown-site" }, 404);
    const loc = locale(req);
    const load = async (collection: "categories" | "tags") =>
      (
        await req.payload.find({
          collection,
          where: { site: { equals: site.id } },
          sort: "slug",
          depth: 0,
          pagination: false,
          overrideAccess: true,
          locale: loc,
          fallbackLocale: "en",
        })
      ).docs.map((doc) => ({ ...projectTerm(doc)!, ...(collection === "categories" ? { description: (doc as unknown as Doc).description ?? null } : {}) }));
    const [categories, tags] = await Promise.all([load("categories"), load("tags")]);
    return json({ categories, tags }, 200, PUBLIC_CACHE);
  },
};

const getProfile: Endpoint = {
  path: "/public/profiles/:handle",
  method: "get",
  handler: async (req) => {
    const handle = String(req.routeParams?.handle ?? "").toLowerCase();
    const { docs } = await req.payload.find({
      collection: "member-profiles",
      where: { and: [{ handle: { equals: handle } }, { visibility: { equals: "public" } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const profile = docs[0];
    if (!profile) return json({ status: "not-found" }, 404);
    // A globally blocked reader has no public presence.
    const member = await req.payload.findByID({ collection: "members", id: relationID(profile.member)!, depth: 0, overrideAccess: true, disableErrors: true });
    if (!member || member.blocked) return json({ status: "not-found" }, 404);
    return json({ handle: profile.handle, displayName: profile.displayName, bio: profile.bio ?? null }, 200, PUBLIC_CACHE);
  },
};

/**
 * Staff preview of the latest draft. The token binds user, collection,
 * document and site and expires after 10 minutes; the user's current roles
 * are re-checked on every request, so revoked access stops working at once.
 */
export async function loadPreview(req: PayloadRequest, token: unknown, loc: Locale) {
  const claims = verifyPreview(token);
  if (!claims) return { status: 401 as const };
  const user = await req.payload.findByID({ collection: "admins", id: claims.uid, depth: 0, overrideAccess: true, disableErrors: true });
  const staff = user ? { ...user, collection: "admins" as const } : null;
  if (!staff || !hasSiteRole(staff, claims.site, WRITE_ROLES)) return { status: 403 as const };
  const doc = (await req.payload
    .findByID({ collection: claims.c, id: claims.id, depth: 0, draft: true, overrideAccess: false, user: staff, locale: loc, fallbackLocale: claims.c === "pages" ? false : "en", disableErrors: true })
    .catch(() => null)) as Doc | null;
  if (!doc || !sameID(doc.site, claims.site)) return { status: 404 as const };
  const site = relationID(doc.site)!;
  if (claims.c === "guides") {
    const [article] = await presentArticles(req, site, loc, [doc], true, { draft: true, user: staff });
    return { status: 200 as const, collection: claims.c, doc: article, site, canPublish: hasSiteRole(staff, site, PUBLISH_ROLES), user: staff };
  }
  const resolver = await buildResolver(req, site, [doc.content], [(doc.seo as Doc | undefined)?.image]);
  return { status: 200 as const, collection: claims.c, doc: projectPage(doc, resolver), site, canPublish: hasSiteRole(staff, site, PUBLISH_ROLES), user: staff };
}

const previewContent: Endpoint = {
  path: "/preview-content",
  method: "get",
  handler: async (req) => {
    const headers = { "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" };
    const result = await loadPreview(req, req.searchParams.get("token"), locale(req));
    if (result.status !== 200) return json({ status: result.status === 404 ? "not-found" : "forbidden" }, result.status, headers);
    // A staff session on the CMS domain must match the token's user when present.
    const sessionUser = asStaff(req.user);
    if (sessionUser && !sameID(sessionUser.id, result.user.id)) return json({ status: "forbidden" }, 403, headers);
    const site = await req.payload.findByID({ collection: "sites", id: result.site, depth: 0, overrideAccess: true, disableErrors: true });
    const expected = req.searchParams.get("site");
    if (!site || (expected !== null && expected !== site.slug)) return json({ status: "not-found" }, 404, headers);
    return json({ preview: true, collection: result.collection, site: { slug: site.slug }, doc: result.doc }, 200, headers);
  },
};

// Literal `/public/profiles/…` is registered before the `/public/:site/…` patterns.
export const publicEndpoints: Endpoint[] = [getProfile, listArticles, getArticle, getPage, getSettings, getTaxonomy, previewContent];
