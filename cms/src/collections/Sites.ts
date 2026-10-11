import { APIError, type CollectionConfig, type FieldAccess } from "payload";

import { inSites, isOwner, ownerOnly, siteIDsWithRole } from "../access/roles";
import { auditAfterChange, auditAfterDelete } from "../hooks/audit";

const ownerField: FieldAccess = ({ req }) => isOwner(req.user);
/**
 * Identity and routing fields are owner-only on create and update: the
 * Plausible mapping selects which upstream site the shared API key reads,
 * `publicUrl` is the origin of reader verification/reset links, and
 * `revalidateUrl` receives signed webhooks. Site admins keep presentation and
 * registration controls (name, languages, default locale, registration).
 */
const OWNER_FIELD = { create: ownerField, update: ownerField };

/**
 * Tenants of the shared CMS ("Сайт" in the admin). The multi-tenant plugin
 * additionally limits non-owner staff to the sites they are assigned to.
 */
export const Sites: CollectionConfig = {
  slug: "sites",
  labels: { singular: { en: "Site", ru: "Сайт" }, plural: { en: "Sites", ru: "Сайты" } },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "slug", "domain", "game"],
    group: { en: "Platform", ru: "Платформа" },
  },
  access: {
    read: ({ req }) => isOwner(req.user) || siteIDsWithRole(req.user, ["admin", "editor", "author", "analyst"]).length > 0,
    create: ownerOnly,
    update: ({ req }) => (isOwner(req.user) ? true : inSites("id", siteIDsWithRole(req.user, ["admin"]))),
    delete: ownerOnly,
  },
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        // Never cascade-delete editorial content with a site.
        for (const collection of ["guides", "pages", "media", "categories", "tags", "site-settings"] as const) {
          const { totalDocs } = await req.payload.count({ collection, where: { site: { equals: id } }, overrideAccess: true, req });
          if (totalDocs > 0) throw new APIError(`Site still owns ${collection}; move or delete them first.`, 409);
        }
      },
    ],
    afterChange: [auditAfterChange("sites", ["slug", "domain", "plausibleSiteId", "registrationEnabled", "revalidateUrl"])],
    afterDelete: [auditAfterDelete("sites")],
  },
  fields: [
    { name: "name", type: "text", required: true, label: { en: "Name", ru: "Название" } },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      access: OWNER_FIELD,
      validate: (value: unknown) =>
        typeof value === "string" && /^[a-z0-9-]{2,40}$/.test(value) ? true : "Use 2–40 lowercase letters, digits or dashes.",
    },
    {
      name: "domain",
      type: "text",
      required: true,
      unique: true,
      access: OWNER_FIELD,
      admin: { description: "Public host name without scheme, e.g. gildra.net" },
    },
    {
      name: "game",
      type: "select",
      required: true,
      access: OWNER_FIELD,
      options: [
        { label: "World of Warcraft", value: "wow" },
        { label: "League of Legends", value: "lol" },
      ],
    },
    {
      name: "languages",
      type: "select",
      hasMany: true,
      required: true,
      defaultValue: ["en", "ru"],
      options: [
        { label: "English", value: "en" },
        { label: "Русский", value: "ru" },
      ],
    },
    {
      name: "defaultLocale",
      type: "select",
      required: true,
      defaultValue: "en",
      options: [
        { label: "English", value: "en" },
        { label: "Русский", value: "ru" },
      ],
    },
    {
      name: "publicUrl",
      type: "text",
      access: OWNER_FIELD,
      required: true,
      admin: { description: "Canonical origin used for preview, verification and reset links, e.g. https://gildra.net" },
      validate: (value: unknown) =>
        typeof value === "string" && /^https?:\/\/[^\s/]+$/.test(value) ? true : "Origin like https://example.com without a trailing slash.",
    },
    {
      name: "plausibleSiteId",
      type: "text",
      access: OWNER_FIELD,
      admin: { description: "site_id in Plausible CE (usually the domain). Empty = analytics not configured." },
    },
    {
      name: "revalidateUrl",
      type: "text",
      access: OWNER_FIELD,
      admin: {
        description:
          "Server endpoint of the site that receives signed cache invalidation. The secret lives in CMS_REVALIDATE_SECRET_<SLUG>.",
      },
    },
    {
      name: "registrationEnabled",
      type: "checkbox",
      defaultValue: false,
      admin: { description: "Allow reader self-registration for this site (requires working SMTP)." },
    },
  ],
};
