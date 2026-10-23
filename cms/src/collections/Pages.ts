import type { CollectionConfig } from "payload";

import { PUBLISH_ROLES } from "../access/roles";
import { withEditorialPolicy } from "../editorial/policy";
import { enforcePageRules, validateBlocksField, validatePageId } from "../blocks/rules";
import { articleEditor } from "../fields/editor";
import { seoField } from "../fields/shared";
import { previewTarget, sitePreviewTarget } from "../preview/sitePreview";

/**
 * Block pages: a published document whose `slug` is a web page id
 * ("wow/privacy") replaces that page's block config on the site. `blocks`
 * holds the web app's `BlockInstance[]` per language (components/blocks/README.md
 * in apps/web); an empty language keeps the code config for that language.
 *
 * The page id is chosen from the site's overridable pages
 * (src/blocks/contract.ts, generated from the web page definitions), `game`
 * and `path` follow from it, and `blocks` must pass the same contract the
 * site checks (src/blocks/rules.ts) on every save, drafts included.
 * `summary`/`content` are legacy editorial fields the site ignores for block
 * pages; they stay in the schema and API but are hidden in the editor.
 */
export const Pages: CollectionConfig = withEditorialPolicy(
  {
    slug: "pages",
    labels: { singular: { en: "Page", ru: "Страница" }, plural: { en: "Pages", ru: "Страницы" } },
    admin: {
      useAsTitle: "title",
      defaultColumns: ["title", "sitePage", "languages", "blocksState", "_status"],
      listSearchableFields: ["title", "slug"],
      group: { en: "Content", ru: "Контент" },
      description: {
        en: "Site pages that can be managed from the CMS. Every other section is built in code.",
        ru: "Страницы сайта, которые можно вести из CMS. Остальные разделы собраны в коде.",
      },
      // The page in the site design where the site supports it (CMS_SITE_PREVIEW), else the CMS preview.
      preview: (doc, { locale, req }) => previewTarget({ collection: "pages", doc, locale, req }),
      livePreview: {
        url: ({ data, locale, req }) => sitePreviewTarget({ collection: "pages", doc: data, locale: locale.code, req }),
        breakpoints: [
          { name: "mobile", label: "Телефон", width: 390, height: 844 },
          { name: "desktop", label: "Компьютер", width: 1440, height: 900 },
        ],
      },
    },
    versions: { maxPerDoc: 100, drafts: { autosave: { interval: 2000 }, schedulePublish: true } },
    indexes: [{ fields: ["site", "slug"], unique: true }],
    hooks: { beforeChange: [enforcePageRules] },
    fields: [
      {
        name: "languages",
        type: "ui",
        label: { en: "Languages", ru: "Языки" },
        admin: { components: { Cell: "/components/list/LanguagesCell#LanguagesCell" } },
      },
      {
        name: "sitePage",
        type: "ui",
        label: { en: "Site page", ru: "Страница сайта" },
        admin: { components: { Cell: "/fields/blocksEditor/cells#SitePageCell" } },
      },
      {
        name: "blocksState",
        type: "ui",
        label: { en: "Blocks", ru: "Блоки" },
        admin: { components: { Cell: "/fields/blocksEditor/cells#BlocksStateCell" } },
      },
      { name: "languageBar", type: "ui", admin: { components: { Field: "/components/editor/LanguageBar#LanguageBar" } } },
      { name: "title", type: "text", localized: true, required: true },
      {
        name: "slug",
        type: "text",
        index: true,
        required: true,
        validate: validatePageId,
        admin: { components: { Field: "/fields/blocksEditor/PageIdField#PageIdField" } },
      },
      {
        name: "game",
        type: "select",
        defaultValue: "wow",
        admin: { hidden: true },
        options: [
          { label: "World of Warcraft", value: "wow" },
          { label: "League of Legends", value: "league-of-legends" },
        ],
      },
      {
        name: "path",
        type: "text",
        admin: { hidden: true },
      },
      {
        name: "layout",
        type: "select",
        defaultValue: "default",
        options: [
          { label: { en: "Default (header, main, footer)", ru: "Обычный (шапка, контент, подвал)" }, value: "default" },
          { label: { en: "Bare (header only)", ru: "Без подвала (только шапка)" }, value: "bare" },
        ],
      },
      {
        name: "blocks",
        type: "json",
        localized: true,
        validate: validateBlocksField,
        admin: {
          components: { Field: "/fields/blocksEditor/BlocksEditor#BlocksEditor" },
          description: {
            en: "Blocks of this language. Empty keeps the page from code for this language.",
            ru: "Блоки этого языка. Пусто — для этого языка сайт показывает страницу из кода.",
          },
        },
      },
      {
        name: "pageStatus",
        type: "ui",
        admin: { position: "sidebar", components: { Field: "/fields/blocksEditor/PageSidebar#PageSidebar" } },
      },
      { name: "summary", type: "textarea", localized: true, admin: { hidden: true } },
      { name: "content", type: "richText", localized: true, editor: articleEditor, admin: { hidden: true } },
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
