import {
  BlocksFeature,
  FixedToolbarFeature,
  HeadingFeature,
  lexicalEditor,
  LinkFeature,
  RelationshipFeature,
  UploadFeature,
} from "@payloadcms/richtext-lexical";
import type { Block, TextFieldSingleValidation } from "payload";

import { localizeBlock } from "../admin/fieldLabels";
import { parseVideoUrl } from "../utilities/video";

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

const validateVideo: TextFieldSingleValidation = (value) =>
  parseVideoUrl(value) ? true : "Нужна ссылка на видео YouTube, Twitch или Rutube / A YouTube, Twitch or Rutube video link.";

/** Same link rules as the site renderer: site paths, #anchors, http(s) and mailto only. */
const validateButtonUrl: TextFieldSingleValidation = (value) => {
  const v = typeof value === "string" ? value.trim() : "";
  if (/^\/(?!\/)/.test(v) || /^#[\w-]+$/.test(v) || /^mailto:/i.test(v)) return true;
  try {
    return ["http:", "https:"].includes(new URL(v).protocol) ? true : "Только http(s), mailto или путь на сайте / http(s), mailto or a site path.";
  } catch {
    return "Нужна ссылка или путь на сайте, например /tier-lists / A link or a site path, e.g. /tier-lists.";
  }
};

/** Embedded YouTube, Twitch or Rutube video; the sites embed it from the parsed id only. */
export const VideoBlock: Block = {
  slug: "video",
  labels: { singular: { en: "Video", ru: "Видео" }, plural: { en: "Videos", ru: "Видео" } },
  fields: [
    {
      name: "url",
      type: "text",
      required: true,
      validate: validateVideo,
      label: { en: "Video link", ru: "Ссылка на видео" },
      admin: { description: { en: "YouTube, Twitch (video or clip) or Rutube page link.", ru: "Ссылка на страницу видео YouTube, Twitch (запись или клип) или Rutube." } },
    },
    { name: "caption", type: "text" },
  ],
};

/** Collapsed section ("spoiler"): a summary line that opens the text below it. */
export const DetailsBlock: Block = {
  slug: "details",
  labels: { singular: { en: "Spoiler", ru: "Спойлер" }, plural: { en: "Spoilers", ru: "Спойлеры" } },
  fields: [
    { name: "summary", type: "text", required: true, label: { en: "Visible line", ru: "Видимая строка" } },
    { name: "body", type: "textarea", required: true, label: { en: "Hidden text", ru: "Скрытый текст" } },
  ],
};

/** Two lists side by side: strengths and weaknesses of a build, champion, spec… */
export const ProsConsBlock: Block = {
  slug: "prosCons",
  labels: { singular: { en: "Pros and cons", ru: "Плюсы и минусы" }, plural: { en: "Pros and cons", ru: "Плюсы и минусы" } },
  fields: [
    { name: "pros", type: "array", maxRows: 12, fields: [{ name: "text", type: "text", required: true }] },
    { name: "cons", type: "array", maxRows: 12, fields: [{ name: "text", type: "text", required: true }] },
  ],
};

/** Numbered how-to: rotation priority, setup order, first steps in a mode. */
export const StepsBlock: Block = {
  slug: "steps",
  labels: { singular: { en: "Steps", ru: "Пошаговая инструкция" }, plural: { en: "Steps", ru: "Пошаговые инструкции" } },
  fields: [
    {
      name: "steps",
      type: "array",
      minRows: 1,
      maxRows: 20,
      required: true,
      fields: [
        { name: "title", type: "text", required: true },
        { name: "body", type: "textarea" },
      ],
    },
  ],
};

/** Call-to-action link styled as a button (a site page or an external link). */
export const ButtonBlock: Block = {
  slug: "button",
  labels: { singular: { en: "Button", ru: "Кнопка-ссылка" }, plural: { en: "Buttons", ru: "Кнопки-ссылки" } },
  fields: [
    { name: "label", type: "text", required: true, label: { en: "Button text", ru: "Текст кнопки" } },
    {
      name: "url",
      type: "text",
      required: true,
      validate: validateButtonUrl,
      admin: { description: { en: "A site path like /tier-lists or a full link.", ru: "Путь на сайте, например /tier-lists, или полная ссылка." } },
    },
    {
      name: "style",
      type: "select",
      defaultValue: "primary",
      options: [
        { value: "primary", label: { en: "Accent", ru: "Акцентная" } },
        { value: "secondary", label: { en: "Quiet", ru: "Спокойная" } },
      ],
    },
  ],
};

/**
 * Shared article editor for both sites: native Lexical text, H2–H4 headings,
 * lists and checklists, quotes, links, images from the site's media and the
 * blocks above (callout, video, table, pros/cons, steps, spoiler, button).
 * Internal links/relationships are limited to editorial collections so staff
 * or reader accounts can never be embedded in content.
 */
export const articleEditor = lexicalEditor({
  features: ({ defaultFeatures }) => [
    // Alignment and indentation are not rendered by the sites, so the editor does not offer them.
    ...defaultFeatures.filter((feature) => !["link", "relationship", "upload", "heading", "align", "indent"].includes(feature.key)),
    // H1 is the article title; sections start at H2.
    HeadingFeature({ enabledHeadingSizes: ["h2", "h3", "h4"] }),
    LinkFeature({ enabledCollections: ["guides", "pages"] }),
    RelationshipFeature({ enabledCollections: ["guides", "pages"] }),
    UploadFeature({ enabledCollections: ["media"] }),
    BlocksFeature({
      blocks: [CalloutBlock, VideoBlock, DataTableBlock, ProsConsBlock, StepsBlock, DetailsBlock, ButtonBlock].map(localizeBlock),
    }),
    FixedToolbarFeature(),
  ],
});
