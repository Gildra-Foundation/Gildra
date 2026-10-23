import { describe, expect, it } from "vitest";
import { adminSections } from "../../src/admin/navModel";

const everything = Object.fromEntries(
  ["guides", "pages", "media", "categories", "tags", "site-settings", "members", "admins", "sites", "member-profiles", "audit-log"].map((slug) => [slug, { read: true }]),
);
const permissions = { collections: everything };
const staff = (role: string, platformRole?: string) => ({ collection: "admins", id: 1, platformRole, sites: [{ site: 1, role }] });
const hrefs = (user: unknown, lang = "ru") => adminSections(user, permissions, lang).flatMap((section) => section.items.map((item) => item.href));

describe("admin navigation by role", () => {
  it("owner sees every section", () => {
    expect(hrefs(staff("admin", "owner"))).toMatchInlineSnapshot(`
      [
        "/admin",
        "/admin/articles",
        "/admin/collections/media",
        "/admin/analytics",
        "/admin/collections/pages",
        "/admin/collections/categories",
        "/admin/collections/tags",
        "/admin/collections/site-settings",
        "/admin/users",
        "/admin/collections/members",
        "/admin/collections/admins",
        "/admin/collections/sites",
        "/admin/collections/member-profiles",
        "/admin/collections/audit-log",
      ]
    `);
  });

  it("editor works on content but not on staff, sites or the audit log", () => {
    expect(hrefs(staff("editor"))).toMatchInlineSnapshot(`
      [
        "/admin",
        "/admin/articles",
        "/admin/collections/media",
        "/admin/analytics",
        "/admin/collections/pages",
        "/admin/collections/categories",
        "/admin/collections/tags",
        "/admin/collections/site-settings",
        "/admin/users",
        "/admin/collections/members",
      ]
    `);
  });

  it("author gets articles and media only, no pages, taxonomy, settings, people or analytics", () => {
    expect(hrefs(staff("author"))).toEqual(["/admin", "/admin/articles", "/admin/collections/media"]);
  });

  it("analyst gets the dashboard and analytics only", () => {
    expect(hrefs(staff("analyst"))).toEqual(["/admin", "/admin/analytics"]);
  });

  it("admin of a site also manages staff and the audit log", () => {
    const list = hrefs(staff("admin"));
    expect(list).toContain("/admin/collections/admins");
    expect(list).toContain("/admin/collections/audit-log");
  });
});
