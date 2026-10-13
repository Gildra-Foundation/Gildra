import type { CollectionConfig } from "payload";

import { PUBLISH_ROLES } from "../access/roles";
import { withEditorialPolicy } from "../editorial/policy";
import { articleEditor } from "../fields/editor";
import { seoField, validateSlug } from "../fields/shared";
import { previewUrlFor } from "../preview/token";

/**
 * Pages come in two flavours:
 * - editorial pages: `content` rich text (legacy, still supported);
 * - block pages: `blocks` holds a JSON array in the exact shape of the web
 *   app's `BlockInstance[]` (see components/blocks/README.md in the web repo).
 *   The web app looks a page up by `slug` = page id ("wow/home") and, when a
 *   published document with `blocks` exists, renders it instead of the TS
 *   config. Unknown block types are rejected by the web app at render time,
 *   so a typo cannot break production — the code config is used instead.
 *
 * Every pre-existing page (including `league-of-legends/*`) belongs to the
 * Gildra site; `game`, `blocks` and `slug` are unchanged.
 */
export const Pages: CollectionConfig = withEditorialPolicy(
  {
    slug: "pages",
    labels: { singular: { en: "Page", ru: "Страница" }, plural: { en: "Pages", ru: "Страницы" } },
    admin: {
      useAsTitle: "title",
      defaultColumns: ["title", "languages", "slug", "site", "_status"],
      listSearchableFields: ["title", "slug"],
      group: { en: "Content", ru: "Контент" },
      preview: previewUrlFor("pages"),
    },
    versions: { maxPerDoc: 100, drafts: { autosave: { interval: 2000 }, schedulePublish: true } },
    indexes: [{ fields: ["site", "slug"], unique: true }],
    fields: [
      {
        name: "languages",
        type: "ui",
        label: { en: "Languages", ru: "Языки" },
        admin: { components: { Cell: "/components/list/LanguagesCell#LanguagesCell" } },
      },
      { name: "languageBar", type: "ui", admin: { components: { Field: "/components/editor/LanguageBar#LanguageBar" } } },
      { name: "title", type: "text", localized: true, required: true },
      {
        name: "slug",
        type: "text",
        index: true,
        required: true,
        validate: validateSlug(true),
        admin: { description: 'Page id used by the web app, e.g. "wow/home" or "league-of-legends/home". Unique within the site.' },
      },
      {
        name: "game",
        type: "select",
        defaultValue: "wow",
        options: [
          { label: "World of Warcraft", value: "wow" },
          { label: "League of Legends", value: "league-of-legends" },
        ],
      },
      {
        name: "path",
        type: "text",
        admin: { description: 'Game-relative canonical path ("/", "/tier-lists"). Informational; routing stays in code.' },
      },
      {
        name: "layout",
        type: "select",
        defaultValue: "default",
        options: [
          { label: "Default (header, main, footer)", value: "default" },
          { label: "Bare (header only)", value: "bare" },
        ],
      },
      {
        name: "blocks",
        type: "json",
        admin: {
          description:
            'Block list in the web app format: [{ "type": "wow.hero" }, { "type": "container", "children": [ ... ] }]. Leave empty to keep the code config.',
        },
      },
      { name: "summary", type: "textarea", localized: true },
      { name: "content", type: "richText", localized: true, editor: articleEditor },
      { name: "publishedAt", type: "date" },
      seoField,
    ],
  },
  {
    drafts: true,
    writeRoles: PUBLISH_ROLES,
    publishRoles: PUBLISH_ROLES,
    deleteRoles: PUBLISH_ROLES,
    relations: [{ path: "seo.image", collection: "media" }],
    publicRead: "published",
    revalidate: true,
  },
  ["content"],
);
