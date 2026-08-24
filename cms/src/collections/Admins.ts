import type { CollectionConfig } from "payload";

export const Admins: CollectionConfig = {
  slug: "admins",
  auth: true,
  access: {
    create: async ({ req }) => {
      if (req.user) return true;
      const existing = await req.payload.count({ collection: "admins" });
      return existing.totalDocs === 0;
    },
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  admin: { useAsTitle: "email" },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
    },
  ],
};
