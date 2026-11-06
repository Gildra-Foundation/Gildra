import "server-only";
import { internalApiJson } from "@/lib/api/internal";
import { runtimeFlags } from "@/lib/flags";
import type { TierEntry } from "@/lib/platform/games/intelligence";
import { talentSpecThemes, type TalentSpecTheme } from "@/lib/talentSpecThemes";
import { loadoutNodeRecords, popularBuilds, type BuildEntry, type PopularBuild } from "@/lib/talentPopularBuilds";
import { getMidnightTalentPageData, type TalentCalculatorData } from "@/lib/talentCalculatorData";
import { decodeWoWTalentLoadout } from "@/lib/wowTalentLoadout";
import type { LeaderboardItem, LeaderboardPage, LeaderboardRegion } from "./mplusLeaderboardView";

/**
 * What the class and specialization pages show next to the game facts: the
 * tier of each specialization in every tier list we publish, and what the
 * Mythic+ leaderboard's top players of the specialization play (hero trees,
 * talent builds, trinkets, weapons). Every read is cached; a source that does
 * not answer is simply left out.
 */
export type TierSource = "gildra" | "mythicstats" | "ugg";
export type TierActivity = "mythic_plus" | "raid";
export type SpecTier = { source: TierSource; activity: TierActivity; tier: string; rank: number; total: number };

export type SpecTopPlayer = { name: string; realm: string; realmRu?: string; region: LeaderboardRegion; score: number };
export type SpecBoard = {
  count: number;
  top?: SpecTopPlayer;
  heroes: Array<{ id: number; name: string; share: number }>;
  trinkets: LeaderboardItem[];
  weapons: LeaderboardItem[];
  builds: PopularBuild[];
};

const tierLists: Array<{ source: TierSource; activity: TierActivity }> = [
  { source: "gildra", activity: "mythic_plus" },
  { source: "mythicstats", activity: "mythic_plus" },
  { source: "ugg", activity: "mythic_plus" },
  { source: "gildra", activity: "raid" },
  { source: "ugg", activity: "raid" },
];
const tierRoles = ["dps", "healer", "tank"] as const;
const boardRegions: LeaderboardRegion[] = ["eu", "us"];

const kebab = (value: string) => value.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const tierKey = (className: string, specName: string) => `${kebab(className)}|${kebab(specName)}`;

async function tierList(source: TierSource, activity: TierActivity, role: (typeof tierRoles)[number]) {
  const params = new URLSearchParams({ activity, role, limit: "60" });
  if (source !== "gildra") params.set("source", source);
  if (source !== "gildra" && activity === "raid") params.set("difficulty", "raid_hero");
  try {
    const page = await internalApiJson<{ entries?: TierEntry[] }>(`/v1/meta/wow/tier-list?${params}`, {
      label: "class tier list", timeoutMs: 3_000, next: { revalidate: 900, tags: ["game-intelligence"] },
    });
    return Array.isArray(page.entries) ? page.entries : [];
  } catch {
    return [];
  }
}

/** Tier of every specialization in every list, by spec slug. */
export async function loadSpecTiers(): Promise<Record<string, SpecTier[]>> {
  if (!runtimeFlags().wowMetaApi) return {};
  const lists = await Promise.all(tierLists.flatMap(({ source, activity }) => tierRoles.map(async (role) => ({ source, activity, entries: await tierList(source, activity, role) }))));
  const bySlug = new Map(talentSpecThemes.map((theme) => [tierKey(theme.className, theme.specName), theme.slug]));
  const tiers: Record<string, SpecTier[]> = {};
  for (const { source, activity, entries } of lists) {
    for (const entry of entries) {
      const slug = bySlug.get(`${entry.classSlug}|${entry.specSlug}`);
      if (!slug || tiers[slug]?.some((item) => item.source === source && item.activity === activity)) continue;
      // MythicStats ranks melee and ranged apart: the position counts within its own group.
      const group = entries.filter((item) => item.group === entry.group);
      (tiers[slug] ??= []).push({ source, activity, tier: entry.tier, rank: group.indexOf(entry) + 1, total: group.length });
    }
  }
  return tiers;
}

async function boardPage(specId: number, region: LeaderboardRegion, limit: number) {
  try {
    const page = await internalApiJson<LeaderboardPage>(`/v1/meta/wow/mythic-plus/leaderboard?spec=${specId}&region=${region}&limit=${limit}`, {
      label: "class leaderboard", timeoutMs: 4_000, next: { revalidate: 900, tags: ["mythic-plus-leaderboard"] },
    });
    return Array.isArray(page.entries) ? page : null;
  } catch {
    return null;
  }
}

function mergeItems(lists: Array<{ items: LeaderboardItem[]; sample: number }>) {
  const sample = lists.reduce((sum, list) => sum + list.sample, 0);
  const merged = new Map<number, LeaderboardItem>();
  for (const { items } of lists) for (const item of items) {
    const known = merged.get(item.id);
    merged.set(item.id, known ? { ...known, count: known.count + item.count } : { ...item });
  }
  return [...merged.values()].map((item) => ({ ...item, share: sample ? item.count / sample : 0 })).sort((left, right) => right.count - left.count).slice(0, 5);
}

/**
 * The top players of one specialization across the EU and US boards. `full`
 * reads every player (talent builds); otherwise only the board's summary.
 */
export async function loadSpecBoard(theme: TalentSpecTheme, full: boolean): Promise<SpecBoard | null> {
  if (!runtimeFlags().wowMetaApi) return null;
  const pages = (await Promise.all(boardRegions.map(async (region) => ({ region, page: await boardPage(theme.specId, region, full ? 100 : 5) }))))
    .filter((item): item is { region: LeaderboardRegion; page: LeaderboardPage } => Boolean(item.page?.summary));
  if (!pages.length) return null;
  const count = pages.reduce((sum, { page }) => sum + (page.summary?.count ?? 0), 0);
  const heroCounts = new Map<number, { id: number; name: string; count: number }>();
  for (const { page } of pages) for (const hero of page.summary?.heroes ?? []) {
    const known = heroCounts.get(hero.id);
    heroCounts.set(hero.id, { id: hero.id, name: hero.name, count: (known?.count ?? 0) + hero.count });
  }
  const leaders = pages.flatMap(({ region, page }) => page.entries.slice(0, 1).map((entry) => ({ region, entry })));
  const best = leaders.sort((left, right) => right.entry.score - left.entry.score)[0];
  const entries: BuildEntry[] = full
    ? pages.flatMap(({ region, page }) => page.entries.map((entry) => ({ name: entry.name, realm: entry.realm.name, realmRu: entry.realm.nameRu, region, score: entry.score, loadout: entry.loadout ?? "", heroId: entry.heroId })))
    : [];
  return {
    count,
    top: best ? { name: best.entry.name, realm: best.entry.realm.name, realmRu: best.entry.realm.nameRu, region: best.region, score: best.entry.score } : undefined,
    heroes: [...heroCounts.values()].filter((hero) => hero.count > 0).map((hero) => ({ id: hero.id, name: hero.name, share: count ? hero.count / count : 0 })).sort((left, right) => right.share - left.share),
    trinkets: mergeItems(pages.map(({ page }) => ({ items: page.summary?.trinkets ?? [], sample: page.summary?.gearSample ?? 0 }))),
    weapons: mergeItems(pages.map(({ page }) => ({ items: page.summary?.weapons ?? [], sample: page.summary?.gearSample ?? 0 }))),
    builds: full ? popularBuilds(entries, { records: await treeRecords(theme, entries) }) : [],
  };
}

/** Summaries of many specializations at once (the class list and a class page). */
export async function loadSpecBoards(themes: TalentSpecTheme[]): Promise<Record<string, SpecBoard>> {
  const boards = await Promise.all(themes.map(async (theme) => [theme.slug, await loadSpecBoard(theme, false)] as const));
  return Object.fromEntries(boards.filter((item): item is readonly [string, SpecBoard] => item[1] !== null));
}

/** Top players' builds of one specialization for the talent calculator's picker (best player only). */
export async function loadSpecBuilds(theme: TalentSpecTheme): Promise<PopularBuild[]> {
  try {
    const board = await loadSpecBoard(theme, true);
    return (board?.builds ?? []).map((build) => ({ ...build, players: build.players.slice(0, 1) }));
  } catch {
    return [];
  }
}

/**
 * Builds compare on the nodes the calculator draws: an in-game string also
 * keeps points once spent in the other hero tree, which would split equal
 * builds. Without the talent trees the raw strings are compared.
 */
async function treeRecords(theme: TalentSpecTheme, entries: BuildEntry[]) {
  const heroIds = [...new Set(entries.map((entry) => entry.heroId).filter((id): id is number => Boolean(id)))];
  const trees = new Map<number, TalentCalculatorData>();
  await Promise.all(heroIds.map(async (heroId) => {
    try { trees.set(heroId, await getMidnightTalentPageData(theme.slug, heroId, "en")); } catch { /* raw strings below */ }
  }));
  return (entry: BuildEntry) => {
    const data = entry.heroId ? trees.get(entry.heroId) : undefined;
    if (!data) return loadoutNodeRecords(entry.loadout);
    const decoded = decodeWoWTalentLoadout(data, entry.loadout);
    if (!decoded) return loadoutNodeRecords(entry.loadout);
    return Object.values(data.trees).flatMap((tree) => tree.nodes.map((node) => {
      const rank = decoded.ranks.get(node.id);
      return rank ? `${rank}:${decoded.choices.get(node.id) ?? ""}` : "";
    }));
  };
}
