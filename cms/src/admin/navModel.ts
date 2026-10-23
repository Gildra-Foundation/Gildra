import { ANALYTICS_ROLES, asStaff, isOwner, PUBLISH_ROLES, siteIDsWithRole, type SiteRole, WRITE_ROLES } from "../access/roles";
import { adminText } from "./text";

export type NavItem = { href: string; label: string; exact?: boolean; activePaths?: string[] };
export type NavSection = { title?: string; collapsible?: boolean; items: NavItem[] };

/** Native forms belong to their workbench; path boundaries prevent sibling matches. */
export function isAdminNavItemActive(pathname: string, item: NavItem): boolean {
  const matches = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  return (item.exact ? pathname === item.href : matches(item.href)) || Boolean(item.activePaths?.some(matches));
}

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
 * Who the sections are for, by site role. Read access alone is too wide: an
 * author may read the site's pages and taxonomy, yet cannot change them, and
 * an analyst only has the dashboard and analytics. Owners see everything.
 */
const SECTION_ROLES: Record<string, readonly SiteRole[]> = {
  guides: WRITE_ROLES,
  articles: WRITE_ROLES,
  media: WRITE_ROLES,
  analytics: ANALYTICS_ROLES,
  pages: PUBLISH_ROLES,
  categories: PUBLISH_ROLES,
  tags: PUBLISH_ROLES,
  "site-settings": PUBLISH_ROLES,
  users: PUBLISH_ROLES,
  members: PUBLISH_ROLES,
  admins: ["admin"],
  sites: ["admin"],
  "member-profiles": ["admin"],
  "audit-log": ["admin"],
};

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
  const roleAllows = (key: string) => isOwner(staff) || siteIDsWithRole(staff, SECTION_ROLES[key] ?? []).length > 0;
  const can = (slug: string) => roleAllows(slug) && canReadCollection(permissions, slug);
  const link = (slug: string, label: string): NavItem | null => (can(slug) ? { href: `/admin/collections/${slug}`, label } : null);
  const analytics = roleAllows("analytics");

  const sections: { title?: string; collapsible?: boolean; items: (NavItem | null)[] }[] = [
    {
      items: [
        { href: "/admin", label: t.navDesk, exact: true },
        can("guides") ? { href: "/admin/articles", label: t.navArticles, activePaths: ["/admin/collections/guides"] } : null,
        link("media", t.media),
        analytics ? { href: "/admin/analytics", label: t.analyticsTitle } : null,
      ],
    },
    { title: t.navSite, items: [link("pages", t.pages), link("categories", t.categories), link("tags", t.tags), link("site-settings", t.settings)] },
    { title: t.navPeople, items: [roleAllows("users") ? { href: "/admin/users", label: language === "en" ? "Users" : "Пользователи" } : null, link("members", t.readers), link("admins", t.staff)] },
    { title: t.navMore, collapsible: true, items: [link("sites", t.sites), link("member-profiles", t.navReaderProfiles), link("audit-log", t.audit)] },
  ];
  return sections
    .map((section) => ({ ...section, items: section.items.filter((item): item is NavItem => item !== null) }))
    .filter((section) => section.items.length > 0);
}
