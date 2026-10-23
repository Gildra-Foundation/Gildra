import { postgresAdapter } from "@payloadcms/db-postgres";
import { multiTenantPlugin } from "@payloadcms/plugin-multi-tenant";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { en } from "@payloadcms/translations/languages/en";
import { ru } from "@payloadcms/translations/languages/ru";
import { buildConfig } from "payload";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { hardenAuthFields } from "./access/authFields";
import { peopleEndpoint } from "./people/data";
import { articleLinksEndpoint } from "./articles/publishedLinks";
import { articlesEndpoint } from "./articles/data";

import { hardenInternalCollections, requireSiteField } from "./access/internal";
import { localizeCollection } from "./admin/fieldLabels";
import { withTitleSearchInAllLocales } from "./admin/localeSearch";
import { applyTranslations, PUBLISH_TRANSLATIONS, withPublishToast } from "./admin/publishCopy";
import { isOwner } from "./access/roles";
import { analyticsReportEndpoint } from "./analytics/endpoint";
import { Admins } from "./collections/Admins";
import { AuditLog } from "./collections/AuditLog";
import { Guides } from "./collections/Guides";
import { Media } from "./collections/Media";
import { MemberProfiles } from "./collections/MemberProfiles";
import { Members } from "./collections/Members";
import { Pages } from "./collections/Pages";
import { Sites } from "./collections/Sites";
import { SiteSettings } from "./collections/SiteSettings";
import { Categories, Tags } from "./collections/Taxonomy";
import { buildEmailAdapter } from "./email";
import { reportRequestError } from "./monitoring/report";
import { csrfOrigins } from "./security/origin";
import { jobsConfig } from "./jobs";
import { migrations } from "./migrations";
import { publicEndpoints } from "./public/endpoints";
import { withEditorChrome } from "./components/editor/editorChrome";
import { withWorkbenchList } from "./components/list/workbenchList";

const filename = fileURLToPath(import.meta.url);

const EDITOR_MENU_LABELS: Record<string, Record<string, string>> = {
  ru: {
    upload: "Изображение",
    relationship: "Ссылка на статью",
    checklist: "Чек-лист",
    unorderedList: "Маркированный список",
    orderedList: "Нумерованный список",
  },
  en: { upload: "Image", relationship: "Article link" },
};

/** Payload's own UI words that read oddly for editors ("Локаль: Русский" is the content language). */
const GENERAL_LABELS: Record<string, Record<string, string>> = {
  // The stock Russian "searchBy" lacks the {{label}} slot, so list search said only "Искать по".
  ru: { locale: "Язык", searchBy: "Поиск: {{label}}", or: "или" },
  en: { locale: "Language" },
};
const dirname = path.dirname(filename);

export default buildConfig({
  serverURL: process.env.PAYLOAD_PUBLIC_URL ?? "http://localhost:3001",
  // Explicit allow-lists: cookie-authenticated requests are accepted only from the CMS origin.
  csrf: csrfOrigins(),
  // Matches nginx `client_max_body_size 25m`; Payload would otherwise accept any size.
  upload: { limits: { fileSize: 25 * 1024 * 1024 }, abortOnLimit: true },
  hooks: { afterError: [reportRequestError] },
  admin: {
    user: Admins.slug,
    importMap: {
      baseDir: path.resolve(dirname),
      importMapFile: path.resolve(dirname, "app/(payload)/admin/importMap.ts"),
    },
    meta: {
      titleSuffix: " — Gildra Network",
    },
    // The custom palette (custom.scss) is dark; a light OS theme would mix dark
    // backgrounds with light-theme text colours, so the admin is always dark.
    theme: "dark",
    // "22 окт. 2026, 20:34" instead of date-fns' "октября 22-е 2026, 8:34 ПП".
    dateFormat: "d MMM yyyy, HH:mm",
    components: {
      graphics: {
        Icon: "/components/Brand#BrandIcon",
        Logo: "/components/Brand#BrandLogo",
      },
      beforeLogin: ["/components/auth/AuthIntro#AuthIntro"],
      // Header: "Find…" (Ctrl+K / ⌘K palette), then the RU / EN interface language switch.
      // Payload renders this list in reverse (custom views use headerActions() for the same order).
      actions: ["/components/nav/LanguageSwitch#LanguageSwitch", "/components/command/CommandButton#CommandButton"],
      // GILDRA wordmark above the site selector (the multi-tenant plugin appends its selector to beforeNav).
      beforeNav: ["/components/nav/NavBrand#NavBrand"],
      beforeNavLinks: ["/components/nav/AdminNav#AdminNav"],
      views: {
        dashboard: { Component: "/components/Dashboard#Dashboard" },
        users: { Component: "/components/people/PeopleView#PeopleView", path: "/users" },
        articles: { Component: "/components/articles/ArticlesView#ArticlesView", path: "/articles" },
        newArticle: { Component: "/components/articles/NewArticleView#NewArticleView", path: "/articles/new" },
        analytics: { Component: "/components/AnalyticsView#AnalyticsView", path: "/analytics" },
        selectSite: { Component: "/components/SelectSiteView#SelectSiteView", path: "/select-site" },
      },
    },
  },
  // The staff work in Russian; English stays available in the account menu.
  i18n: {
    supportedLanguages: { ru, en },
    fallbackLanguage: "ru",
  },
  // Every collection is reached through the curated sidebar (components/nav/AdminNav), not Payload's groups.
  collections: [Sites, Admins, Media, Pages, Guides, Categories, Tags, SiteSettings, Members, MemberProfiles, AuditLog]
    .map(localizeCollection)
    // Pages, media, categories and tags list as Valyro workbenches (components/list); Payload keeps the query and data.
    // Articles and pages get the sticky phone publish bar (components/editor/StickyPublish).
    .map(withWorkbenchList)
    .map(withEditorChrome)
    .map((collection) => ({ ...collection, admin: { ...collection.admin, group: false as const } })),
  localization: {
    // Content languages; the labels name them in the switcher above every editor.
    locales: [
      { code: "en", label: { en: "English", ru: "Английский" } },
      { code: "ru", label: { en: "Russian", ru: "Русский" } },
    ],
    defaultLocale: "en",
    fallback: true,
  },
  editor: lexicalEditor(),
  email: buildEmailAdapter(),
  endpoints: [peopleEndpoint, articlesEndpoint, articleLinksEndpoint, analyticsReportEndpoint, ...publicEndpoints],
  jobs: jobsConfig,
  graphQL: { disable: true },
  secret: process.env.PAYLOAD_SECRET ?? "",
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: postgresAdapter({
    push: process.env.PAYLOAD_DB_PUSH === "true",
    migrationDir: path.resolve(dirname, "migrations"),
    prodMigrations: migrations,
    pool: { connectionString: process.env.PAYLOAD_DATABASE_URL ?? "" },
  }),
  plugins: [
    multiTenantPlugin({
      tenantsSlug: "sites",
      tenantField: { name: "site" },
      tenantsArrayField: { includeDefaultField: false, arrayFieldName: "sites", arrayTenantFieldName: "site" },
      userHasAccessToAllTenants: (user) => isOwner(user),
      // Deleting a site must never cascade into content (Sites.beforeDelete refuses instead).
      cleanupAfterTenantDelete: false,
      collections: {
        // The "Site" column in article and page lists (the plugin hides it by default).
        guides: { tenantFieldOverrides: { admin: { disableListColumn: false } } },
        pages: { tenantFieldOverrides: { admin: { disableListColumn: false } } },
        media: {},
        categories: {},
        tags: {},
        "site-settings": { isGlobal: true },
      },
      i18n: {
        translations: {
          en: { "nav-tenantSelector-label": "Site", "field-assignedTenant-label": "Site", "assign-tenant-button-label": "Move to site" },
          ru: { "nav-tenantSelector-label": "Сайт", "field-assignedTenant-label": "Сайт", "assign-tenant-button-label": "Перенести на сайт" },
        },
      },
    }),
    requireSiteField(["media", "categories", "tags", "site-settings"]),
  ],
  sharp,
}).then((config) => {
  // Lexical merges its stock feature labels into i18n while the config is
  // sanitised, so clearer names for the editor's insert menu go on top here.
  const translations = (config.i18n.translations ??= {}) as Record<string, Record<string, Record<string, Record<string, string>>>>;
  for (const [lang, labels] of Object.entries(EDITOR_MENU_LABELS)) {
    const lexical = ((translations[lang] ??= {}).lexical ??= {});
    for (const [feature, label] of Object.entries(labels)) lexical[feature] = { ...lexical[feature], label };
  }
  for (const [lang, labels] of Object.entries(GENERAL_LABELS)) {
    const general = ((translations[lang] ??= {}).general ??= {}) as unknown as Record<string, string>;
    Object.assign(general, labels);
  }
  applyTranslations(translations as unknown as Record<string, Record<string, Record<string, string>>>, PUBLISH_TRANSLATIONS);
  return hardenAuthFields(hardenInternalCollections(withTitleSearchInAllLocales(withPublishToast(config))));
});
