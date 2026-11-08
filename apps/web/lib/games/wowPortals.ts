import { p, type Lang } from "@/lib/i18n-paths";
import { WOW_VERSION_EMBLEMS } from "@/lib/games/wow/assets";

/**
 * The versions of World of Warcraft the site covers, in the order of the top strip.
 * The URL owns the version: `/wow/forever/**` and `/wow/mists/**` belong to their
 * version, every other page to the live game.
 */
export type WowPortalId = "retail" | "forever" | "mists";
type Words = { en: string; ru: string };
/** A part of the site several versions have; switching versions keeps the reader in it. */
export type WowPortalSection = "raids" | "dungeons" | "classes" | "talents";

export type WowPortal = {
  id: WowPortalId;
  label: Words;
  /** Narrow screens. */
  shortLabel: Words;
  /** The version's emblem from the game files. */
  emblem: string;
  path: string;
  sections: Partial<Record<WowPortalSection, string>>;
};

export const wowPortals: readonly WowPortal[] = [
  {
    id: "retail",
    emblem: WOW_VERSION_EMBLEMS.retail,
    label: { en: "Midnight", ru: "Midnight" },
    shortLabel: { en: "Midnight", ru: "Midnight" },
    path: "/wow",
    sections: { raids: "/wow/raids", dungeons: "/wow/mythic-plus", classes: "/wow/classes", talents: "/wow/classes" },
  },
  {
    id: "forever",
    emblem: WOW_VERSION_EMBLEMS.forever,
    label: { en: "Forever", ru: "Forever" },
    shortLabel: { en: "Forever", ru: "Forever" },
    path: "/wow/forever",
    sections: { raids: "/wow/forever/raids", dungeons: "/wow/forever/dungeons" },
  },
  {
    id: "mists",
    emblem: WOW_VERSION_EMBLEMS.mists,
    label: { en: "Mists of Pandaria Classic", ru: "Mists of Pandaria Classic" },
    shortLabel: { en: "MoP Classic", ru: "MoP Classic" },
    path: "/wow/mists",
    sections: { classes: "/wow/mists", talents: "/wow/mists/talents" },
  },
];

const bare = (path: string) => path.replace(/[?#].*$/, "").replace(/^\/ru(?=\/|$)/, "").replace(/\/$/, "") || "/";
const within = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** The version a page belongs to. */
export function wowPortalFor(path: string): WowPortal {
  const page = bare(path);
  return wowPortals.find((portal) => portal.id !== "retail" && within(page, portal.path)) ?? wowPortals[0];
}

/** Retail pages that are the same part of the site as a version's section without sharing its address. */
const retailAliases: Record<string, WowPortalSection> = {
  "/wow/dungeons": "dungeons",
  "/wow/lairs": "raids",
  "/talents": "talents",
  "/specs": "classes",
};

/** The section of the version the page stands in (the longest matching address wins). */
export function wowPortalSection(path: string): WowPortalSection | null {
  const page = bare(path);
  const portal = wowPortalFor(page);
  let best: { section: WowPortalSection; length: number } | null = null;
  const consider = (section: WowPortalSection, href: string) => {
    // A version's hub is its own page, not a section, unless the section lives there.
    if (within(page, href) && (!best || href.length > best.length)) best = { section, length: href.length };
  };
  for (const [section, href] of Object.entries(portal.sections) as [WowPortalSection, string][]) consider(section, href);
  if (portal.id === "retail") for (const [href, section] of Object.entries(retailAliases)) consider(section, href);
  return (best as { section: WowPortalSection } | null)?.section ?? null;
}

/** Where switching to a version leads from the current page: the same section there, or the version's hub. */
export function wowPortalHref(lang: Lang, target: WowPortal, fromPath = "/") {
  const section = wowPortalSection(fromPath);
  return p(lang, (section && target.sections[section]) || target.path);
}
