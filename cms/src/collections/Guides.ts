import type { CollectionConfig } from "payload";

import { ARTICLE_POLICY, withEditorialPolicy } from "../editorial/policy";
import { articleEditor } from "../fields/editor";
import { gameDataField, seoTabField, validateSlug } from "../fields/shared";
import { previewTarget, sitePreviewTarget } from "../preview/sitePreview";

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
      defaultColumns: ["title", "slug", "_status", "publishedAt", "updatedAt"],
      group: { en: "Content", ru: "Контент" },
      // The site's own draft page where the site supports it (CMS_SITE_PREVIEW), else the CMS preview.
      preview: (doc, { locale, req }) => previewTarget({ collection: "guides", doc, locale, req }),
      // Side-by-side preview in the site design; refreshes after every (auto)save.
      livePreview: {
        url: ({ data, locale, req }) => sitePreviewTarget({ collection: "guides", doc: data, locale: locale.code, req }),
        breakpoints: [
          { name: "mobile", label: "Телефон", width: 390, height: 844 },
          { name: "tablet", label: "Планшет", width: 768, height: 1024 },
          { name: "desktop", label: "Компьютер", width: 1440, height: 900 },
        ],
      },
    },
    versions: {
      maxPerDoc: 100,
      drafts: { autosave: { interval: 2000 }, schedulePublish: true },
    },
    indexes: [{ fields: ["site", "slug"], unique: true }],
    fields: [
      // Read-only facts of the article's site for the editor UI (not stored).
      { name: "siteSlug", type: "text", virtual: "site.slug", admin: { hidden: true } },
      { name: "siteName", type: "text", virtual: "site.name", admin: { hidden: true } },
      { name: "siteGame", type: "text", virtual: "site.game", admin: { hidden: true } },
      { name: "sitePublicUrl", type: "text", virtual: "site.publicUrl", admin: { hidden: true } },
      {
        name: "articlePanel",
        type: "ui",
        admin: { position: "sidebar", components: { Field: "/components/editor/ArticlePanel#ArticlePanel" } },
      },
      {
        type: "tabs",
        tabs: [
          {
            label: { en: "Article", ru: "Статья" },
            fields: [
              {
                name: "title",
                type: "text",
                localized: true,
                required: true,
                admin: { description: { en: "Main heading on the site.", ru: "Главный заголовок статьи на сайте." } },
              },
              {
                name: "slug",
                type: "text",
                index: true,
                required: true,
                validate: validateSlug(),
                admin: {
                  description: "Unique within the site. Changing it changes the public URL.",
                  components: { Field: "/components/editor/SlugField#SlugField" },
                },
              },
              {
                name: "summary",
                type: "textarea",
                localized: true,
                required: true,
                admin: {
                  description: {
                    en: "One or two sentences for article lists, link previews and search results.",
                    ru: "Одно-два предложения: показываются в списке статей, в превью ссылок и в поиске.",
                  },
                },
              },
              { name: "content", type: "richText", localized: true, required: true, editor: articleEditor },
              {
                name: "hero",
                type: "upload",
                relationTo: "media",
                label: { en: "Cover", ru: "Обложка" },
                admin: {
                  description: {
                    en: "Wide image at the top of the article and in link previews, ideally 1600×900.",
                    ru: "Широкая картинка над статьёй и в превью ссылок, лучше 1600×900.",
                  },
                },
              },
            ],
          },
          {
            label: { en: "Game data", ru: "Игровые данные" },
            description: {
              en: "Patch and game references: they date the article and link it to classes or champions on the site.",
              ru: "Патч и игровые сущности: по ним видно, насколько статья свежая, и она связывается с классами или чемпионами на сайте.",
            },
            fields: [
              {
                name: "category",
                type: "select",
                options: [
                  { value: "mythic-plus", label: "Mythic+" },
                  { value: "raid", label: { en: "Raid", ru: "Рейд" } },
                  { value: "class", label: { en: "Class", ru: "Класс" } },
                  { value: "gear", label: { en: "Gear", ru: "Снаряжение" } },
                ],
                admin: {
                  description: "Legacy Gildra category kept for compatibility. Prefer Categories.",
                  condition: (data) => data?.siteGame !== "lol",
                },
              },
              gameDataField,
            ],
          },
          {
            label: "SEO",
            fields: [
              { name: "seoPreview", type: "ui", admin: { components: { Field: "/components/editor/SeoPreview#SeoPreview" } } },
              seoTabField,
            ],
          },
        ],
      },
      {
        name: "author",
        type: "relationship",
        relationTo: "admins",
        admin: {
          position: "sidebar",
          description: {
            en: "Empty: the site signs the article as its editorial team. Staff with the author role are always recorded as themselves.",
            ru: "Пусто — на сайте подпись «Редакция». Сотрудники с ролью «автор» записываются автоматически.",
          },
        },
      },
      { name: "categories", type: "relationship", relationTo: "categories", hasMany: true, admin: { position: "sidebar" } },
      { name: "tags", type: "relationship", relationTo: "tags", hasMany: true, admin: { position: "sidebar" } },
      {
        name: "publishedAt",
        type: "date",
        admin: {
          position: "sidebar",
          date: { pickerAppearance: "dayAndTime", displayFormat: "d MMM yyyy, HH:mm", timeFormat: "HH:mm" },
          description: {
            en: "Date shown on the site; set automatically on first publication.",
            ru: "Дата на сайте; ставится сама при первой публикации.",
          },
        },
      },
    ],
  },
  ARTICLE_POLICY,
  ["content"],
);
