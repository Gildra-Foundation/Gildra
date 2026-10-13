import { ANALYTICS_ROLES, asStaff, isOwner, siteIDsWithRole } from "../access/roles";
import { adminText } from "./text";

export type NavItem = { href: string; label: string; exact?: boolean };
export type NavSection = { title?: string; collapsible?: boolean; items: NavItem[] };

type Permissions = { collections?: Record<string, { read?: unknown } | undefined> } | null | undefined;

/**
 * Read access to a collection. Owners get `true`; site staff get a
 * site-scoped grant (`{ permission: true, where }`), which counts too.
 */
export function canReadCollection(permissions: Permissions, slug: string): boolean {
  const read = permissions?.collections?.[slug]?.read;
  return read === true || (typeof read === "object" && read !== null && (read as { permission?: unknown }).permission === true);
}

/**
 * Admin sections the user may open, grouped as in the sidebar: the everyday
 * work on top (desk, articles, media, analytics), site structure and people
 * below, rarely used screens under "More". The sidebar and the command palette
 * show the same list; a link appears only with read access. Client-safe.
 */
export function adminSections(user: unknown, permissions: Permissions, language: unknown): NavSection[] {
  const staff = asStaff(user);
  if (!staff) return [];
  const t = adminText(language);
  const can = (slug: string) => canReadCollection(permissions, slug);
  const link = (slug: string, label: string): NavItem | null => (can(slug) ? { href: `/admin/collections/${slug}`, label } : null);
  const analytics = isOwner(staff) || siteIDsWithRole(staff, ANALYTICS_ROLES).length > 0;

  const sections: { title?: string; collapsible?: boolean; items: (NavItem | null)[] }[] = [
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
  return sections
    .map((section) => ({ ...section, items: section.items.filter((item): item is NavItem => item !== null) }))
    .filter((section) => section.items.length > 0);
}
