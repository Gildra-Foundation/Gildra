import type { Payload } from "payload";

import { isOwner, PUBLISH_ROLES, type SiteRole, siteIDsWithRole, WRITE_ROLES } from "../access/roles";

/**
 * Creating a site-scoped document needs a site. The native editor takes it from
 * the site selector cookie (`payload-tenant`); without one, Payload's autosave
 * create fails on the required site and the edit view renders empty. These
 * helpers decide, before the native view runs, whether the user must first
 * choose a site. Nothing is guessed: a user who can write to several sites
 * always chooses.
 */
export { SITE_COOKIE } from "./siteCookie";

export const CREATE_ROLES: Record<string, readonly SiteRole[]> = {
  guides: WRITE_ROLES,
  pages: PUBLISH_ROLES,
  media: WRITE_ROLES,
  categories: PUBLISH_ROLES,
  tags: PUBLISH_ROLES,
};

export type SiteOption = { id: number | string; name: string; domain: string; game: string };

/** Sites where `user` may create documents of `collection`. */
export async function writableSites(payload: Payload, user: unknown, collection: string): Promise<SiteOption[]> {
  const roles = CREATE_ROLES[collection];
  if (!roles) return [];
  const allowed = isOwner(user) ? null : siteIDsWithRole(user, roles).map(String);
  if (allowed && allowed.length === 0) return [];
  const { docs } = await payload.find({ collection: "sites", depth: 0, pagination: false, overrideAccess: true, sort: "name" });
  return docs.filter((s) => !allowed || allowed.includes(String(s.id))).map((s) => ({ id: s.id, name: s.name, domain: s.domain, game: s.game }));
}

/** `/admin/collections/<slug>/create` for a site-scoped collection → slug, else null. */
export function siteScopedCreate(segments: string[] | undefined): string | null {
  if (!segments || segments.length !== 3 || segments[0] !== "collections" || segments[2] !== "create") return null;
  return segments[1] in CREATE_ROLES ? segments[1] : null;
}

/** Does the selected site (cookie value) allow creating here? */
export function selectionAllows(selected: string | undefined, sites: SiteOption[]): boolean {
  return Boolean(selected) && sites.some((s) => String(s.id) === selected);
}
