import type { Field, TextFieldSingleValidation } from "payload";

/**
 * URL-safe slug check. Slugs stay plain text fields (not the experimental
 * `slugField()`), unique per site through a compound index.
 */
export const validateSlug =
  (allowSlash = false): TextFieldSingleValidation =>
  (value, { previousValue }) => {
    if (typeof value !== "string" || value.length === 0) return "Slug is required.";
    // Legacy slugs stay valid as long as they are not edited.
    if (value === previousValue) return true;
    const pattern = allowSlash ? /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/ : /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    return pattern.test(value) && value.length <= 160 ? true : "Use lowercase letters, digits and dashes.";
  };

const SEO_FIELDS: Field[] = [
  { name: "title", type: "text", localized: true, maxLength: 70 },
  { name: "description", type: "textarea", localized: true, maxLength: 170 },
  { name: "image", type: "upload", relationTo: "media" },
  { name: "noIndex", type: "checkbox", defaultValue: false },
];

export const seoField: Field = {
  name: "seo",
  type: "group",
  label: "SEO",
  admin: { position: "sidebar" },
  fields: SEO_FIELDS,
};

/** Same `seo` group (same data and columns) for a form tab instead of the sidebar. */
export const seoTabField: Field = { name: "seo", type: "group", label: false, fields: SEO_FIELDS };

const WOW_CLASSES = [
  "death-knight",
  "demon-hunter",
  "druid",
  "evoker",
  "hunter",
  "mage",
  "monk",
  "paladin",
  "priest",
  "rogue",
  "shaman",
  "warlock",
  "warrior",
];

/**
 * Game references as plain structured data. Values are identifiers the site
 * frontends already use; there is no coupling to a game database here.
 */
export const gameDataField: Field = {
  name: "gameContext",
  type: "group",
  label: { en: "Game context", ru: "Игровой контекст" },
  fields: [
    {
      type: "row",
      fields: [
        { name: "patch", type: "text", admin: { description: "e.g. 11.2.5 or 25.20" } },
        { name: "season", type: "text" },
        { name: "lastReviewedAt", type: "date", admin: { description: "When the content was last checked against the game." } },
      ],
    },
    {
      type: "collapsible",
      label: "World of Warcraft",
      // Each site edits only its own game; documents without a known site show both.
      admin: { initCollapsed: false, condition: (data) => data?.siteGame !== "lol" },
      fields: [
        { name: "wowClass", type: "select", options: WOW_CLASSES },
        { name: "wowSpec", type: "text", admin: { description: "Spec slug, e.g. frost" } },
        { name: "wowInstance", type: "text", admin: { description: "Raid or dungeon slug" } },
      ],
    },
    {
      type: "collapsible",
      label: "League of Legends",
      admin: { initCollapsed: false, condition: (data) => data?.siteGame !== "wow" },
      fields: [
        { name: "lolChampion", type: "text", admin: { description: "Champion id, e.g. Ahri" } },
        {
          name: "lolRole",
          type: "select",
          options: ["top", "jungle", "mid", "bottom", "support"],
        },
        {
          name: "lolMentionedChampions",
          type: "text",
          hasMany: true,
          admin: { description: { en: "Champion ids shown under the article, e.g. Garen.", ru: "ID чемпионов, которые покажутся под статьёй, например Garen." } },
        },
      ],
    },
  ],
};
