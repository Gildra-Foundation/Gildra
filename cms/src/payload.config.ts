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
      afterNavLinks: ["/components/AnalyticsNavLink#AnalyticsNavLink"],
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
  collections: [Sites, Admins, Media, Pages, Guides, Categories, Tags, SiteSettings, Members, MemberProfiles, AuditLog].map(
    localizeCollection,
  ),
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
        guides: {},
        pages: {},
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
}).then(hardenInternalCollections);
