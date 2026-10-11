import {
  BlocksFeature,
  FixedToolbarFeature,
  lexicalEditor,
  LinkFeature,
  RelationshipFeature,
  UploadFeature,
} from "@payloadcms/richtext-lexical";
import type { Block } from "payload";

import { localizeBlock } from "../admin/fieldLabels";

/** Highlighted note inside an article. Plain text only — nothing executable. */
export const CalloutBlock: Block = {
  slug: "callout",
  labels: { singular: { en: "Callout", ru: "Заметка" }, plural: { en: "Callouts", ru: "Заметки" } },
  fields: [
    {
      name: "tone",
      type: "select",
      required: true,
      defaultValue: "info",
      options: [
        { label: { en: "Info", ru: "Информация" }, value: "info" },
        { label: { en: "Tip", ru: "Совет" }, value: "tip" },
        { label: { en: "Warning", ru: "Предупреждение" }, value: "warning" },
      ],
    },
    { name: "title", type: "text" },
    { name: "body", type: "textarea", required: true },
  ],
};

/**
 * Simple data table stored as structured rows. The Lexical table feature is
 * still exported as EXPERIMENTAL_TableFeature in 3.88.0, so tables use a block.
 */
export const DataTableBlock: Block = {
  slug: "dataTable",
  labels: { singular: { en: "Table", ru: "Таблица" }, plural: { en: "Tables", ru: "Таблицы" } },
  fields: [
    { name: "caption", type: "text" },
    {
      name: "columns",
      type: "array",
      minRows: 1,
      maxRows: 12,
      required: true,
      fields: [{ name: "label", type: "text", required: true }],
    },
    {
      name: "rows",
      type: "array",
      maxRows: 200,
      fields: [
        {
          name: "cells",
          type: "array",
          maxRows: 12,
          fields: [{ name: "value", type: "text" }],
        },
      ],
    },
  ],
};

/**
 * Shared article editor for both sites: native Lexical text, headings, lists,
 * quotes, links, images from the site's media and the two blocks above.
 * Internal links/relationships are limited to editorial collections so staff
 * or reader accounts can never be embedded in content.
 */
export const articleEditor = lexicalEditor({
  features: ({ defaultFeatures }) => [
    ...defaultFeatures.filter((feature) => !["link", "relationship", "upload"].includes(feature.key)),
    LinkFeature({ enabledCollections: ["guides", "pages"] }),
    RelationshipFeature({ enabledCollections: ["guides", "pages"] }),
    UploadFeature({ enabledCollections: ["media"] }),
    BlocksFeature({ blocks: [CalloutBlock, DataTableBlock].map(localizeBlock) }),
    FixedToolbarFeature(),
  ],
});
