/** Shared by the server loader and the client tabs: the modes, the source tabs and how one
 *  list request (source × mode × raid difficulty × PvP bracket × region) is keyed. */
import type { TierActivity, TierEntry, TierRole } from "@/lib/platform/games/intelligence";

/** The three modes of /tier-lists; `pvp` is the arena (rated PvP) mode. */
export type TierMode = TierActivity | "pvp";
export const TIER_MODES: TierMode[] = ["mythic_plus", "raid", "pvp"];
export function isTierMode(value: string | null): value is TierMode {
  return Boolean(value && (TIER_MODES as string[]).includes(value));
}

/** `gildra` is Gildra's own tier (the consensus of every source for Mythic+ and raids, the Blizzard
 *  ladder for the arena). `sim` is mythistone.com's simulated damage (its own board). The rest are
 *  the sites' own lists. */
export type TierSourceId =
  | "gildra" | "wowhead" | "icyveins" | "wowgg" | "ugg" | "mythicstats" | "wowmeta" | "wythic" | "method" | "murlok" | "sim";
/** Sources published as role lists through /v1/meta/wow/tier-list. */
export type ListTierSource = Exclude<TierSourceId, "sim">;
export const TIER_SOURCES: TierSourceId[] = ["gildra", "wowhead", "icyveins", "wowgg", "ugg", "mythicstats", "wowmeta", "wythic", "method", "murlok", "sim"];
export function isTierSource(value: string | null): value is TierSourceId {
  return Boolean(value && (TIER_SOURCES as string[]).includes(value));
}

/** One source tab as the API lists it (GET /v1/meta/wow/tier-list/sources). */
export type TierSourceInfo = { id: ListTierSource; activities: TierMode[]; anyBracket?: boolean; regions?: boolean };

/** The tabs of the page; `ladder` says whether the arena has Gildra's own tier. */
export type TierSourceTabs = { tabs: TierSourceInfo[]; ladder: boolean };

/** Without the sources endpoint (an older API) the page offers the tabs every API version serves. */
export const LEGACY_SOURCES: TierSourceInfo[] = [
  { id: "mythicstats", activities: ["mythic_plus"] },
  { id: "ugg", activities: ["mythic_plus", "raid"] },
];

/** The site name each tab carries and the page the bottom source line links to. */
export const SOURCE_SITES: Record<Exclude<TierSourceId, "gildra">, { name: string; home: string }> = {
  wowhead: { name: "Wowhead", home: "https://www.wowhead.com/guides/classes/tier-lists" },
  icyveins: { name: "Icy Veins", home: "https://www.icy-veins.com/wow/" },
  wowgg: { name: "wow.gg", home: "https://wow.gg/" },
  ugg: { name: "u.gg", home: "https://u.gg/wow/tier-list" },
  mythicstats: { name: "MythicStats", home: "https://mythicstats.com/spec" },
  wowmeta: { name: "WoWMeta", home: "https://wowmeta.com/" },
  wythic: { name: "Wythic", home: "https://wythic.com/en" },
  method: { name: "Method", home: "https://www.method.gg/guides/tier-list/mythic-plus" },
  murlok: { name: "Murlok", home: "https://murlok.io/" },
  sim: { name: "MythiStone", home: "https://mythistone.com/pages/tierlist" },
};

export const PVP_BRACKETS = ["3v3", "2v2", "shuffle", "blitz", "rbg"] as const;
export type PvpBracket = (typeof PVP_BRACKETS)[number];
export const PVP_REGIONS = ["all", "eu", "us"] as const;
export type PvpRegion = (typeof PVP_REGIONS)[number];
export const isBracket = (value: string | null): value is PvpBracket => Boolean(value && (PVP_BRACKETS as readonly string[]).includes(value));
export const isRegion = (value: string | null): value is PvpRegion => Boolean(value && (PVP_REGIONS as readonly string[]).includes(value));

/** Raid difficulties a source tab offers; `raid_hero` is the default. */
export const SOURCE_DIFFICULTIES = ["all", "raid_myth", "raid_hero", "raid_normal"];
export const DEFAULT_SOURCE_DIFFICULTY = "raid_hero";

export type SourceSlice = { roles: Record<TierRole, TierEntry[]>; updatedAt: string; tiersDerived?: boolean };
/** Slices rendered on the server, by `sourceKey`. */
export type TierSourceSlices = Record<string, SourceSlice>;

/** Everything one list request depends on; parts a mode does not use are left out of the key. */
export type ListQuery = {
  source: ListTierSource;
  mode: TierMode;
  difficulty?: string;
  bracket?: PvpBracket;
  region?: PvpRegion;
  /** wow.gg's dungeon, raid or boss slice. */
  selection?: { type: string; id: string; addon: string; keyType?: string; difficulty?: string };
};

export function sourceKey(query: ListQuery) {
  const parts: string[] = [query.source, query.mode];
  if (query.mode === "raid") parts.push(query.difficulty ?? DEFAULT_SOURCE_DIFFICULTY);
  if (query.mode === "pvp") parts.push(query.bracket ?? "3v3", query.region ?? "all");
  if (query.selection) parts.push(query.selection.type, query.selection.id, query.selection.addon, query.selection.keyType ?? "", query.selection.difficulty ?? "");
  return parts.join("|");
}

/** The query string of one role of a list request. */
export function listParams(query: ListQuery, role: TierRole) {
  const params = new URLSearchParams({ activity: query.mode, role, limit: "60" });
  if (query.source !== "gildra") params.set("source", query.source);
  if (query.mode === "raid" && !query.selection && (query.source === "ugg" || query.source === "wowgg")) params.set("difficulty", query.difficulty ?? DEFAULT_SOURCE_DIFFICULTY);
  if (query.mode === "pvp") {
    params.set("bracket", query.bracket ?? "3v3");
    if (query.region && query.region !== "all") params.set("region", query.region);
  }
  if (query.selection) {
    params.set("selectionType", query.selection.type);
    params.set("selectionId", query.selection.id);
    params.set("addon", query.selection.addon);
    if (query.selection.keyType) params.set("keyType", query.selection.keyType);
    if (query.selection.difficulty) params.set("difficulty", query.selection.difficulty);
  }
  return params;
}
