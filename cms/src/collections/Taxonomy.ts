import type { CollectionConfig } from "payload";

import { PUBLISH_ROLES } from "../access/roles";
import { type EditorialPolicy, withEditorialPolicy } from "../editorial/policy";
import { validateSlug } from "../fields/shared";

const TAXONOMY_POLICY: EditorialPolicy = {
  drafts: false,
  writeRoles: PUBLISH_ROLES,
  publishRoles: PUBLISH_ROLES,
  deleteRoles: PUBLISH_ROLES,
  relations: [],
  publicRead: "all",
  revalidate: true,
};

const taxonomy = (slug: "categories" | "tags", labels: CollectionConfig["labels"], withDescription: boolean): CollectionConfig =>
  withEditorialPolicy(
    {
      slug,
      labels,
      admin: { useAsTitle: "title", defaultColumns: ["title", "slug"], group: { en: "Content", ru: "Контент" } },
      indexes: [{ fields: ["site", "slug"], unique: true }],
      fields: [
        { name: "title", type: "text", localized: true, required: true },
        { name: "slug", type: "text", required: true, index: true, validate: validateSlug() },
        ...(withDescription ? [{ name: "description", type: "textarea" as const, localized: true }] : []),
      ],
    },
    TAXONOMY_POLICY,
  );

export const Categories = taxonomy(
  "categories",
  { singular: { en: "Category", ru: "Рубрика" }, plural: { en: "Categories", ru: "Рубрики" } },
  true,
);

export const Tags = taxonomy("tags", { singular: { en: "Tag", ru: "Тег" }, plural: { en: "Tags", ru: "Теги" } }, false);
