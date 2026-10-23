import type { CollectionConfig } from "payload";

/** Collections edited with the Gildra editor chrome (articles and pages). */
const EDITOR_CHROME = new Set(["guides", "pages"]);

/** Payload's publish button in the sticky phone bar and the atlas amber (components/editor/StickyPublish). */
export function withEditorChrome<T extends CollectionConfig>(collection: T): T {
  if (!EDITOR_CHROME.has(collection.slug)) return collection;
  const components = collection.admin?.components ?? {};
  return {
    ...collection,
    admin: {
      ...collection.admin,
      components: { ...components, edit: { ...components.edit, PublishButton: "/components/editor/StickyPublish#StickyPublish" } },
    },
  };
}
