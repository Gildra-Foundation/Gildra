import type { SanitizedPermissions, TypedUser } from "payload";
import React from "react";

import { ANALYTICS_ROLES, asStaff, isOwner, siteIDsWithRole } from "../../access/roles";
import { adminText } from "../../admin/text";
import { AdminNavLinks, type NavSection } from "./AdminNavLinks";

/**
 * Sidebar of the admin: the everyday work on top (desk, articles, media,
 * analytics), site structure and people below, rarely used screens folded
 * into "More". Every collection has `admin.group: false`, so Payload's own
 * grouped list does not repeat them; links appear only with read access.
 */
export function AdminNav({
  user,
  permissions,
  i18n,
}: {
  user?: TypedUser | null;
  permissions?: SanitizedPermissions;
  i18n?: { language?: string };
}) {
  const staff = asStaff(user);
  if (!staff) return null;
  const t = adminText(i18n?.language);
  const can = (slug: string) => permissions?.collections?.[slug]?.read === true;
  const link = (slug: string, label: string) => (can(slug) ? { href: `/admin/collections/${slug}`, label } : null);
  const analytics = isOwner(staff) || siteIDsWithRole(staff, ANALYTICS_ROLES).length > 0;

  const sections: NavSection[] = [
    {
      items: [
        { href: "/admin", label: t.navDesk, exact: true },
        link("guides", t.navArticles),
        link("media", t.media),
        analytics ? { href: "/admin/analytics", label: t.analyticsTitle } : null,
      ],
    },
    { title: t.navSite, items: [link("pages", t.pages), link("categories", t.categories), link("tags", t.tags), link("site-settings", t.settings)] },
    { title: t.navPeople, items: [link("members", t.readers), link("admins", t.staff)] },
    { title: t.navMore, collapsible: true, items: [link("sites", t.sites), link("member-profiles", t.navReaderProfiles), link("audit-log", t.audit)] },
  ];
  return <AdminNavLinks sections={sections.map((s) => ({ ...s, items: s.items.filter(Boolean) })).filter((s) => s.items.length > 0)} />;
}
