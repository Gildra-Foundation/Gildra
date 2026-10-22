import { describe, expect, it } from "vitest";
import { adminSections, isAdminNavItemActive } from "../../src/admin/navModel";

describe("article workbench navigation", () => {
  const owner = { collection: "admins", id: 1, platformRole: "owner" };
  const permissions = { collections: { guides: { read: true } } };
  const articleLink = adminSections(owner, permissions, "en").flatMap((section) => section.items).find((item) => item.href === "/admin/articles")!;

  it("keeps Articles active through create/edit/version native routes", () => {
    for (const path of ["/admin/articles", "/admin/collections/guides", "/admin/collections/guides/create", "/admin/collections/guides/42", "/admin/collections/guides/42/versions/3"]) {
      expect(isAdminNavItemActive(path, articleLink), path).toBe(true);
    }
  });

  it("does not highlight similarly prefixed or unrelated routes", () => {
    for (const path of ["/admin/articles-old", "/admin/collections/guides-extra", "/admin/collections/pages/42", "/admin"]) {
      expect(isAdminNavItemActive(path, articleLink), path).toBe(false);
    }
    expect(isAdminNavItemActive("/admin/articles", { href: "/admin", label: "Desk", exact: true })).toBe(false);
  });

  it("keeps aliases behind the existing collection permission and staff check", () => {
    const denied = adminSections(owner, { collections: { guides: { read: false } } }, "ru");
    expect(denied.flatMap((section) => section.items).some((item) => item.href === "/admin/articles")).toBe(false);
    expect(adminSections({ ...owner, collection: "members" }, permissions, "en")).toEqual([]);
    const scoped = { collections: { guides: { read: { permission: true, where: { site: { equals: 2 } } } } } };
    expect(adminSections(owner, scoped, "ru").flatMap((section) => section.items).find((item) => item.href === "/admin/articles")?.activePaths).toEqual(["/admin/collections/guides"]);
  });
});
