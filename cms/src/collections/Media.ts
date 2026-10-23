import sharp from "sharp";
import { APIError, type CollectionBeforeOperationHook, type CollectionConfig } from "payload";

import { PUBLISH_ROLES, WRITE_ROLES } from "../access/roles";
import { withEditorialPolicy } from "../editorial/policy";

/** Raster formats only: SVG can carry script and is rejected on purpose. */
export const MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];

export const SVG_REJECTED = "SVG не поддерживается — загрузите PNG, JPG, WebP, AVIF или GIF. / SVG is not supported — upload PNG, JPG, WebP, AVIF or GIF.";
/** Longest allowed side in pixels; larger originals are refused, not silently downscaled. */
export const MAX_IMAGE_SIDE = 8000;
export const imageTooLarge = (w: number, h: number) => {
  const size = w && h ? ` (${w}×${h})` : "";
  return `Изображение слишком большое${size}; максимум ${MAX_IMAGE_SIDE}×${MAX_IMAGE_SIDE} px. / Image too large${size}; the limit is ${MAX_IMAGE_SIDE}×${MAX_IMAGE_SIDE} px.`;
};

/**
 * Runs before Payload processes the file, so an SVG (or an oversized image)
 * gets a clear bilingual message instead of the generic "file type not allowed".
 */
const checkUpload: CollectionBeforeOperationHook = async ({ args, operation, req }) => {
  if (operation !== "create" && operation !== "update") return args;
  const file = req.file;
  if (!file) return args;
  const name = (file.name ?? "").toLowerCase();
  if (file.mimetype === "image/svg+xml" || /\.svgz?$/.test(name)) throw new APIError(SVG_REJECTED, 400, undefined, true);
  if (file.data?.length) {
    try {
      const { width = 0, height = 0 } = await sharp(file.data, { limitInputPixels: MAX_IMAGE_SIDE * MAX_IMAGE_SIDE * 2 }).metadata();
      if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) throw new APIError(imageTooLarge(width, height), 400, undefined, true);
    } catch (error) {
      if (error instanceof APIError) throw error;
      // Unreadable or absurdly large (pixel-limit) input: let Payload's own checks answer for corrupt files.
      if (error instanceof Error && /pixel limit/i.test(error.message)) throw new APIError(imageTooLarge(0, 0), 400, undefined, true);
    }
  }
  return args;
};

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
    admin: { group: { en: "Content", ru: "Контент" } },
    hooks: { beforeOperation: [checkUpload] },
    upload: {
      staticDir: process.env.PAYLOAD_MEDIA_DIR ?? "media",
      mimeTypes: MEDIA_MIME_TYPES,
      adminThumbnail: adminThumbnail,
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
