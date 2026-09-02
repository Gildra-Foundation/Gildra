import type { CollectionConfig } from "payload";

/**
 * Pages come in two flavours:
 * - editorial pages: `content` rich text (legacy, still supported);
 * - block pages: `blocks` holds a JSON array in the exact shape of the web
 *   app's `BlockInstance[]` (see components/blocks/README.md in the web repo).
 *   The web app looks a page up by `slug` = page id ("wow/home") and, when a
 *   published document with `blocks` exists, renders it instead of the TS
 *   config. Unknown block types are rejected by the web app at render time,
 *   so a typo cannot break production — the code config is used instead.
 */
export const Pages: CollectionConfig = {
  slug: "pages",
  access: {
    create: ({ req }) => Boolean(req.user),
    read: ({ req }) => req.user ? true : { _status: { equals: "published" } },
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  admin: { useAsTitle: "title", defaultColumns: ["title", "slug", "game", "_status"] },
  versions: { drafts: true },
  fields: [
    { name: "title", type: "text", localized: true, required: true },
    {
      name: "slug",
      type: "text",
      unique: true,
      index: true,
      required: true,
      admin: { description: 'Page id used by the web app, e.g. "wow/home" or "league-of-legends/home".' },
    },
    {
      name: "game",
      type: "select",
      defaultValue: "wow",
      options: [
        { label: "World of Warcraft", value: "wow" },
        { label: "League of Legends", value: "league-of-legends" },
      ],
    },
    {
      name: "path",
      type: "text",
      admin: { description: 'Game-relative canonical path ("/", "/tier-lists"). Informational; routing stays in code.' },
    },
    {
      name: "layout",
      type: "select",
      defaultValue: "default",
      options: [
        { label: "Default (header, main, footer)", value: "default" },
        { label: "Bare (header only)", value: "bare" },
      ],
    },
    {
      name: "blocks",
      type: "json",
      admin: {
        description:
          'Block list in the web app format: [{ "type": "wow.hero" }, { "type": "container", "children": [ ... ] }]. Leave empty to keep the code config.',
      },
    },
    { name: "summary", type: "textarea", localized: true },
    { name: "content", type: "richText", localized: true },
    { name: "publishedAt", type: "date" },
  ],
};
