import type { CollectionConfig } from "payload";

/** Collections whose list opens as a Valyro workbench (articles have their own at /admin/articles). */
export const WORKBENCH_LISTS = new Set(["pages", "media", "categories", "tags"]);

/** Cookie with the collections whose list the viewer switched to Payload's own table. */
export const NATIVE_COOKIE = "gd-list-native";

/**
 * Payload keeps the list route, its query (search, filters, page, sort in the
 * URL), access control and data; only the component that draws the list is
 * replaced (`admin.components.views.list`).
 */
export function withWorkbenchList<T extends CollectionConfig>(collection: T): T {
  if (!WORKBENCH_LISTS.has(collection.slug)) return collection;
  const components = collection.admin?.components ?? {};
  return {
    ...collection,
    admin: {
      ...collection.admin,
      components: {
        ...components,
        views: { ...components.views, list: { ...components.views?.list, Component: "/components/list/CollectionList#CollectionList" } },
      },
    },
  };
}

