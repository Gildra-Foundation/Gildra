import type { CollectionConfig } from "payload";

import { PUBLISH_ROLES, WRITE_ROLES } from "../access/roles";
import { withEditorialPolicy } from "../editorial/policy";

/** Raster formats only: SVG can carry script and is rejected on purpose. */
export const MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];

export const Media: CollectionConfig = withEditorialPolicy(
  {
    slug: "media",
    labels: { singular: { en: "Media", ru: "Медиа" }, plural: { en: "Media", ru: "Медиа" } },
    admin: { group: { en: "Content", ru: "Контент" } },
    upload: {
      staticDir: process.env.PAYLOAD_MEDIA_DIR ?? "media",
      mimeTypes: MEDIA_MIME_TYPES,
    },
    fields: [
      { name: "alt", type: "text", localized: true, required: true },
      { name: "caption", type: "textarea", localized: true },
    ],
  },
  {
    drafts: false,
    writeRoles: WRITE_ROLES,
    publishRoles: PUBLISH_ROLES,
    deleteRoles: PUBLISH_ROLES,
    relations: [],
    // Files are public assets; reading metadata is public as before.
    publicRead: "all",
    revalidate: false,
  },
);
