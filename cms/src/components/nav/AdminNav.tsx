import { cookies } from "next/headers";
import type { CollectionSlug, Payload, SanitizedPermissions, TypedUser, Where } from "payload";
import React from "react";

import { asStaff } from "../../access/roles";
import { adminSections, type NavSection } from "../../admin/navModel";
import { SITE_COOKIE } from "../../admin/siteCookie";
import { AdminNavLinks } from "./AdminNavLinks";

/** Sidebar items that show how many documents they hold (for the selected site). */
const COUNTED: Record<string, CollectionSlug> = {
  "/admin/articles": "guides",
  "/admin/collections/pages": "pages",
  "/admin/collections/media": "media",
};

/**
 * Counts for the visible counted items, with the user's own access and the
 * site chosen in the selector. Indexed counts run in parallel; a failed count
 * only hides its number.
 */
async function navCounts(payload: Payload | undefined, user: TypedUser, sections: NavSection[]): Promise<Record<string, number>> {
  if (!payload) return {};
  const site = Number((await cookies()).get(SITE_COOKIE)?.value);
  const where: Where | undefined = Number.isInteger(site) && site > 0 ? { site: { equals: site } } : undefined;
  const hrefs = sections.flatMap((section) => section.items.map((item) => item.href)).filter((href) => COUNTED[href]);
  const counts = await Promise.all(
    hrefs.map((href) =>
      payload
        .count({ collection: COUNTED[href], where, user, overrideAccess: false })
        .then((result) => [href, result.totalDocs] as const)
        .catch(() => null),
    ),
  );
  return Object.fromEntries(counts.filter((entry) => entry !== null));
}

/**
 * Sidebar of the admin (sections in `admin/navModel.ts`). Every collection has
 * `admin.group: false`, so Payload's own grouped list does not repeat them.
 */
export async function AdminNav({
  user,
  permissions,
  i18n,
  payload,
}: {
  user?: TypedUser | null;
  permissions?: SanitizedPermissions;
  i18n?: { language?: string };
  payload?: Payload;
}) {
  if (!user || !asStaff(user)) return null;
  const sections = adminSections(user, permissions as never, i18n?.language);
  return <AdminNavLinks sections={sections} counts={await navCounts(payload, user, sections)} />;
}
