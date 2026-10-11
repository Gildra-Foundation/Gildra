import type { Access, PayloadRequest, Where } from "payload";

/**
 * Authority model of the shared CMS.
 *
 * - Only documents of the `admins` collection are staff. Every helper that can
 *   grant an editorial privilege checks `user.collection === "admins"`, so a
 *   logged-in reader from `members` never inherits editor rights.
 * - `platformRole: "owner"` sees and manages every site and provisions staff.
 * - Everybody else gets per-site roles from the `sites` array on their admin
 *   document: admin > editor > author, plus the read-only `analyst`.
 */
export const SITE_ROLES = ["admin", "editor", "author", "analyst"] as const;
export type SiteRole = (typeof SITE_ROLES)[number];

/** Roles that may create/update editorial documents (authors only their own). */
export const WRITE_ROLES: SiteRole[] = ["admin", "editor", "author"];
/** Roles that may change what is live: publish, unpublish, schedule, delete. */
export const PUBLISH_ROLES: SiteRole[] = ["admin", "editor"];
/** Roles that may read analytics of a site. Authors are deliberately absent. */
export const ANALYTICS_ROLES: SiteRole[] = ["admin", "editor", "analyst"];

export type ID = number | string;

type SiteAssignment = { site?: unknown; role?: unknown; id?: unknown };

export type StaffUser = {
  collection: "admins";
  id: ID;
  email?: string;
  platformRole?: string | null;
  sites?: SiteAssignment[] | null;
};

export type MemberUser = {
  collection: "members";
  id: ID;
  email?: string;
  blocked?: boolean | null;
  memberships?: { site?: unknown; status?: unknown }[] | null;
};

/** Relationship values arrive either as an ID or as a populated document. */
export function relationID(value: unknown): ID | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "object" && "id" in (value as object)) {
    const id = (value as { id: unknown }).id;
    if (typeof id === "number" || typeof id === "string") return id;
  }
  return null;
}

export function sameID(a: unknown, b: unknown): boolean {
  const left = relationID(a);
  const right = relationID(b);
  return left !== null && right !== null && String(left) === String(right);
}

export function asStaff(user: unknown): StaffUser | null {
  if (!user || typeof user !== "object") return null;
  return (user as { collection?: unknown }).collection === "admins" ? (user as StaffUser) : null;
}

export function asMember(user: unknown): MemberUser | null {
  if (!user || typeof user !== "object") return null;
  const member = (user as { collection?: unknown }).collection === "members" ? (user as MemberUser) : null;
  // A globally blocked member keeps a valid JWT until it expires; treat it as anonymous.
  return member && !member.blocked ? member : null;
}

export function isOwner(user: unknown): boolean {
  return asStaff(user)?.platformRole === "owner";
}

/** Site IDs where the staff user holds one of `roles`. Owners are not expanded here. */
export function siteIDsWithRole(user: unknown, roles: readonly SiteRole[]): ID[] {
  const staff = asStaff(user);
  if (!staff || !Array.isArray(staff.sites)) return [];
  const out: ID[] = [];
  for (const row of staff.sites) {
    const id = relationID(row?.site);
    if (id !== null && typeof row?.role === "string" && roles.includes(row.role as SiteRole)) out.push(id);
  }
  return out;
}

export function roleOnSite(user: unknown, site: unknown): SiteRole | null {
  const staff = asStaff(user);
  if (!staff || !Array.isArray(staff.sites)) return null;
  for (const row of staff.sites) {
    if (sameID(row?.site, site) && typeof row?.role === "string" && SITE_ROLES.includes(row.role as SiteRole)) {
      return row.role as SiteRole;
    }
  }
  return null;
}

/** True for owners and for staff holding one of `roles` on `site`. */
export function hasSiteRole(user: unknown, site: unknown, roles: readonly SiteRole[]): boolean {
  if (isOwner(user)) return true;
  const role = roleOnSite(user, site);
  return role !== null && roles.includes(role);
}

/** Staff user that may enter the admin panel at all. */
export function canUseAdmin(user: unknown): boolean {
  const staff = asStaff(user);
  if (!staff) return false;
  return isOwner(staff) || siteIDsWithRole(staff, SITE_ROLES).length > 0;
}

/** `{ [field]: { in: ids } }`, or `false` when there is nothing to match. */
export function inSites(field: string, ids: ID[]): Where | false {
  return ids.length > 0 ? { [field]: { in: ids } } : false;
}

export const ownerOnly: Access = ({ req }) => isOwner(req.user);
export const nobody: Access = () => false;
export const anyone: Access = () => true;

/** Site-scoped access for staff holding `roles`; owners get everything. */
export const staffSiteAccess =
  (roles: readonly SiteRole[], field = "site"): Access =>
  ({ req }) => {
    if (isOwner(req.user)) return true;
    return inSites(field, siteIDsWithRole(req.user, roles));
  };

export function requestSiteIDs(req: PayloadRequest, roles: readonly SiteRole[]): ID[] | "all" {
  if (isOwner(req.user)) return "all";
  return siteIDsWithRole(req.user, roles);
}
