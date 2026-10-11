import type { CollectionConfig } from "payload";

import { ARTICLE_POLICY, withEditorialPolicy } from "../editorial/policy";
import { articleEditor } from "../fields/editor";
import { gameDataField, seoField, validateSlug } from "../fields/shared";
import { previewUrlFor } from "../preview/token";

/**
 * Articles of both sites. The slug `guides` and every legacy field (`category`
 * select, `hero`, `publishedAt`) are kept for API compatibility.
 *
 * RU and EN share one publication status: `localizeStatus` is experimental in
 * Payload 3.88.0 and deliberately not enabled. Publishing publishes both locales.
 */
export const Guides: CollectionConfig = withEditorialPolicy(
  {
    slug: "guides",
    labels: { singular: { en: "Article", ru: "Статья" }, plural: { en: "Articles", ru: "Статьи" } },
    admin: {
      useAsTitle: "title",
      defaultColumns: ["title", "slug", "author", "_status", "updatedAt"],
      group: { en: "Content", ru: "Контент" },
      preview: previewUrlFor("guides"),
    },
    versions: {
      maxPerDoc: 100,
      drafts: { autosave: { interval: 2000 }, schedulePublish: true },
    },
    indexes: [{ fields: ["site", "slug"], unique: true }],
    fields: [
      { name: "title", type: "text", localized: true, required: true },
      {
        name: "slug",
        type: "text",
        index: true,
        required: true,
        validate: validateSlug(),
        admin: { description: "Unique within the site. Changing it changes the public URL." },
      },
      {
        name: "category",
        type: "select",
        options: ["mythic-plus", "raid", "class", "gear"],
        admin: { description: "Legacy Gildra category kept for compatibility. Prefer Categories." },
      },
      { name: "summary", type: "textarea", localized: true, required: true },
      { name: "content", type: "richText", localized: true, required: true, editor: articleEditor },
      { name: "hero", type: "upload", relationTo: "media", label: { en: "Cover", ru: "Обложка" } },
      {
        name: "author",
        type: "relationship",
        relationTo: "admins",
        admin: { position: "sidebar", description: "Authors are always recorded as themselves." },
      },
      { name: "categories", type: "relationship", relationTo: "categories", hasMany: true, admin: { position: "sidebar" } },
      { name: "tags", type: "relationship", relationTo: "tags", hasMany: true, admin: { position: "sidebar" } },
      { name: "publishedAt", type: "date", admin: { position: "sidebar" } },
      gameDataField,
      seoField,
    ],
  },
  ARTICLE_POLICY,
  ["content"],
);
