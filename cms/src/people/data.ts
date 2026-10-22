import { Forbidden, type Endpoint, type PayloadRequest, type Where } from "payload";
import { asStaff, canUseAdmin, isOwner, relationID, siteIDsWithRole } from "../access/roles";
import { profilesForPage } from "../access/profilePage";
import { json } from "../utilities/http";
import { PAGE_SIZE, optionalID, pageNumber, searchText, type PageResult, type SiteChoice } from "../components/workspace/query";

export type PersonRow = {
  id: string; name: string; email: string; role: string | null; sites: { name: string; role: string }[];
  verified: boolean | null; blocked: boolean | null; createdAt: string; href: string; profileHref: string | null;
};
export type PeopleResult = PageResult<PersonRow> & {
  kind: "staff" | "readers"; sites: SiteChoice[]; canReadReaders: boolean; canCreateStaff: boolean;
};

type Params = { kind?: unknown; site?: unknown; q?: unknown; page?: unknown };

/** Access-aware server pagination; never serialize an authentication document. */
export async function peopleData(req: PayloadRequest, params: Params): Promise<PeopleResult> {
  if (!canUseAdmin(req.user)) throw new Forbidden(req.t);
  const owner = isOwner(req.user);
  const staff = asStaff(req.user)!;
  const canReadReaders = owner || siteIDsWithRole(staff, ["admin"]).length > 0;
  const kind = params.kind === "readers" ? "readers" : "staff";
  if (kind === "readers" && !canReadReaders) throw new Forbidden(req.t);
  const scope = owner ? null : siteIDsWithRole(staff, kind === "readers" ? ["admin"] : ["admin", "editor", "author", "analyst"]).map(String);
  const foundSites = await req.payload.find({ collection: "sites", req, user: req.user, overrideAccess: false,
    depth: 0, pagination: false, select: { name: true },
    ...(scope ? { where: { id: { in: scope } } } : {}), sort: "name" });
  const sites = foundSites.docs.map((s) => ({ id: String(s.id), name: s.name }));
  const bySite = new Map(sites.map((s) => [s.id, s.name]));
  const site = optionalID(params.site);
  if (typeof params.site === "string" && params.site !== "" && (!site || !bySite.has(site))) throw new Forbidden(req.t);
  const q = searchText(params.q);
  const where: Where[] = [];
  if (site) where.push({ [kind === "staff" ? "sites.site" : "memberships.site"]: { equals: site } });
  if (q) where.push(kind === "staff" ? { or: [{ name: { contains: q } }, { email: { contains: q } }] } : { email: { contains: q } });
  const filter: Where = where.length ? { and: where } : {};
  const base = { req, user: req.user, overrideAccess: false as const, depth: 0, limit: PAGE_SIZE,
    page: pageNumber(params.page), sort: ["-createdAt", "id"], where: filter };
  let rows: PersonRow[], page: number, totalDocs: number, totalPages: number;
  if (kind === "staff") {
    const result = await req.payload.find({ ...base, collection: "admins",
      select: { name: true, email: true, platformRole: true, sites: true, createdAt: true } });
    const managed = owner ? null : new Set(siteIDsWithRole(staff, ["admin", "editor"]).map(String));
    rows = result.docs.map((doc) => ({ id: String(doc.id), name: doc.name || "", email: doc.email,
      role: doc.platformRole, sites: (doc.sites ?? []).flatMap((assignment) => {
        const id = String(relationID(assignment.site));
        if (!owner && String(doc.id) !== String(staff.id) && !managed?.has(id)) return [];
        return bySite.has(id) ? [{ name: bySite.get(id)!, role: assignment.role }] : [];
      }), verified: null, blocked: null, createdAt: doc.createdAt,
      href: `/admin/collections/admins/${doc.id}`, profileHref: null }));
    ({ page = 1, totalDocs, totalPages } = result);
  } else {
    const result = await req.payload.find({ ...base, collection: "members",
      select: { email: true, memberships: true, blocked: true, _verified: true, createdAt: true } });
    const ids = result.docs.map((d) => d.id);
    const profiles = await profilesForPage(req, ids);
    const profileByMember = new Map(profiles.map((p) => [String(relationID(p.member)), p]));
    rows = result.docs.map((doc) => {
      const profile = profileByMember.get(String(doc.id));
      return { id: String(doc.id), name: profile?.displayName || profile?.handle || "", email: doc.email,
        role: null, sites: (doc.memberships ?? []).flatMap((m) => {
          const id = String(relationID(m.site));
          return bySite.has(id) ? [{ name: bySite.get(id)!, role: m.status }] : [];
        }), verified: typeof doc._verified === "boolean" ? doc._verified : null,
        blocked: typeof doc.blocked === "boolean" ? doc.blocked : null, createdAt: doc.createdAt,
        href: `/admin/collections/members/${doc.id}`, profileHref: profile ? `/admin/collections/member-profiles/${profile.id}` : null };
    });
    ({ page = 1, totalDocs, totalPages } = result);
  }
  return { kind, rows, page, totalDocs, totalPages, sites, canReadReaders, canCreateStaff: owner };
}

export const peopleEndpoint: Endpoint = {
  path: "/admin/users", method: "get", handler: async (req) => {
    const p = req.searchParams;
    return json(await peopleData(req, { kind: p.get("kind"), site: p.get("site"), q: p.get("q"), page: p.get("page") }));
  },
};
