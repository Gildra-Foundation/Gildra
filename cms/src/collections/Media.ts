import type { CollectionConfig } from "payload";

import { PUBLISH_ROLES, WRITE_ROLES } from "../access/roles";
import { withEditorialPolicy } from "../editorial/policy";

/** Raster formats only: SVG can carry script and is rejected on purpose. */
export const MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];

/**
 * Admin thumbnails (lists, pickers, upload fields) through Next's image
 * optimizer: a 384 px WebP/AVIF instead of the full original, with no stored
 * image sizes and so no schema change. `next.config.ts` allows /api/media/file/**.
 */
const adminThumbnail = ({ doc }: { doc: Record<string, unknown> }): string | false => {
  if (typeof doc.url !== "string") return false;
  let path: string;
  try {
    path = new URL(doc.url, "http://cms.local").pathname;
  } catch {
    return false;
  }
  // Animated GIFs would lose their animation; anything outside the allowed path is not optimised.
  if (doc.mimeType === "image/gif" || !path.startsWith("/api/media/file/")) return doc.url;
  return `/_next/image?url=${encodeURIComponent(path)}&w=384&q=75`;
};

export const Media: CollectionConfig = withEditorialPolicy(
  {
    slug: "media",
    labels: { singular: { en: "Media", ru: "Медиа" }, plural: { en: "Media", ru: "Медиа" } },
    admin: {
      group: { en: "Content", ru: "Контент" },
      listSearchableFields: ["filename", "alt", "caption"],
      defaultColumns: ["filename", "alt", "mimeType", "updatedAt"],
    },
    upload: {
      staticDir: process.env.PAYLOAD_MEDIA_DIR ?? "media",
      mimeTypes: MEDIA_MIME_TYPES,
      adminThumbnail: adminThumbnail,
    },
    fields: [
      {
        name: "mediaGuidance",
        type: "ui",
        admin: {
          components: {
            Field: {
              path: "/components/media/MediaGuidance#MediaGuidance",
              clientProps: { formats: MEDIA_MIME_TYPES.map((mime) => mime.slice("image/".length).toUpperCase()) },
            },
          },
        },
      },
      {
        name: "alt", type: "text", localized: true, required: true,
        admin: { description: {
          en: "Briefly describe what the image communicates for people who cannot see it. Use a description, not a filename.",
          ru: "Кратко опишите смысл изображения для тех, кто его не видит. Нужен текст описания, а не имя файла.",
        } },
      },
      {
        name: "caption", type: "textarea", localized: true,
        admin: { description: {
          en: "Optional context or image credit. You can also find this image by its description or caption in the media library.",
          ru: "Необязательный контекст или автор изображения. По описанию и подписи можно найти изображение в медиатеке.",
        } },
      },
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
