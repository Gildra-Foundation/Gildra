import type { CollectionConfig, Field } from "payload";

import { withEditorialPolicy } from "../editorial/policy";

const validateHref = (value: unknown) =>
  typeof value === "string" && (/^\/(?!\/)[^\s]*$/.test(value) || /^https:\/\/[^\s]+$/.test(value))
    ? true
    : "Use a site path starting with / or an https:// URL.";

const linkList = (name: string, label: string): Field => ({
  name,
  type: "array",
  label,
  maxRows: 30,
  fields: [
    {
      type: "row",
      fields: [
        { name: "label", type: "text", localized: true, required: true },
        { name: "href", type: "text", required: true, validate: validateHref },
      ],
    },
  ],
});

/**
 * One settings document per site (multi-tenant `isGlobal`: the plugin adds a
 * unique `site` field). Contains only public presentation data — never secrets.
 */
export const SiteSettings: CollectionConfig = withEditorialPolicy(
  {
    slug: "site-settings",
    labels: { singular: { en: "Site settings", ru: "Настройки сайта" }, plural: { en: "Site settings", ru: "Настройки сайтов" } },
    admin: { useAsTitle: "siteTitle", group: { en: "Platform", ru: "Платформа" } },
    fields: [
      { name: "siteTitle", type: "text", localized: true, required: true },
      { name: "tagline", type: "text", localized: true },
      linkList("navigation", "Navigation"),
      linkList("footerLinks", "Footer links"),
      {
        name: "defaultSeo",
        type: "group",
        fields: [
          { name: "title", type: "text", localized: true, maxLength: 70 },
          { name: "description", type: "textarea", localized: true, maxLength: 170 },
          { name: "image", type: "upload", relationTo: "media" },
        ],
      },
      {
        name: "social",
        type: "array",
        maxRows: 12,
        fields: [
          {
            type: "row",
            fields: [
              { name: "platform", type: "select", required: true, options: ["discord", "x", "youtube", "twitch", "telegram", "github"] },
              { name: "url", type: "text", required: true, validate: validateHref },
            ],
          },
        ],
      },
    ],
  },
  {
    drafts: false,
    writeRoles: ["admin"],
    publishRoles: ["admin"],
    deleteRoles: ["admin"],
    relations: [{ path: "defaultSeo.image", collection: "media" }],
    publicRead: "all",
    revalidate: true,
  },
);
