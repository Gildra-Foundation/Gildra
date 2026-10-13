import { postgresAdapter } from "@payloadcms/db-postgres";
import { multiTenantPlugin } from "@payloadcms/plugin-multi-tenant";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { en } from "@payloadcms/translations/languages/en";
import { ru } from "@payloadcms/translations/languages/ru";
import { buildConfig } from "payload";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { hardenInternalCollections, requireSiteField } from "./access/internal";
import { localizeCollection } from "./admin/fieldLabels";
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
import { jobsConfig } from "./jobs";
import { migrations } from "./migrations";
import { publicEndpoints } from "./public/endpoints";

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
    components: {
      graphics: {
        Icon: "/components/Brand#BrandIcon",
        Logo: "/components/Brand#BrandLogo",
      },
      // Ctrl+K / ⌘K palette and its "Find…" button in the header.
      actions: ["/components/command/CommandButton#CommandButton"],
      beforeNavLinks: ["/components/nav/AdminNav#AdminNav"],
      views: {
        dashboard: { Component: "/components/Dashboard#Dashboard" },
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
  endpoints: [analyticsReportEndpoint, ...publicEndpoints],
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
  return hardenInternalCollections(config);
});
