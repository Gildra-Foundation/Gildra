import type { CollectionConfig } from "payload";

export const Guides: CollectionConfig = {
  slug: "guides",
  access: {
    create: ({ req }) => Boolean(req.user),
    read: ({ req }) => req.user ? true : { _status: { equals: "published" } },
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  admin: { useAsTitle: "title" },
  versions: { drafts: true },
  fields: [
    { name: "title", type: "text", localized: true, required: true },
    { name: "slug", type: "text", unique: true, index: true, required: true },
    {
      name: "category",
      type: "select",
      options: ["mythic-plus", "raid", "class", "gear"],
      required: true,
    },
    { name: "summary", type: "textarea", localized: true, required: true },
    { name: "content", type: "richText", localized: true, required: true },
    { name: "hero", type: "upload", relationTo: "media" },
    { name: "publishedAt", type: "date" },
  ],
};
