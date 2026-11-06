import { classColors } from "@/lib/atlas/dataPalette";
import { getTalentSpecTheme, getTalentSpecThemeById, talentSpecThemes, type TalentSpecTheme } from "@/lib/talentSpecThemes";
import { specIcon } from "./assets";

/**
 * The Mythic+ character leaderboard as the Gildra API serves it
 * (GET /v1/meta/wow/mythic-plus/leaderboard, datasets mplus-leaderboard-<region>,
 * backend/internal/gamemeta/leaderboard.go). Client-safe: types, lookups and links.
 */
export type LeaderboardRegion = "eu" | "us" | "kr" | "tw";
export type LeaderboardRole = "tank" | "healer" | "dps";

export const leaderboardRegions: LeaderboardRegion[] = ["eu", "us", "kr", "tw"];
export const leaderboardRoles: LeaderboardRole[] = ["tank", "healer", "dps"];
export const isLeaderboardRegion = (value: unknown): value is LeaderboardRegion => leaderboardRegions.includes(value as LeaderboardRegion);
export const isLeaderboardRole = (value: unknown): value is LeaderboardRole => leaderboardRoles.includes(value as LeaderboardRole);

export type LeaderboardRealm = { slug: string; name: string; nameRu?: string };
export type LeaderboardEntry = {
  rank: number;
  name: string;
  realm: LeaderboardRealm;
  classId: number;
  specId: number;
  role: LeaderboardRole;
  heroId?: number;
  heroName?: string;
  score: number;
  key?: number;
  itemLevel?: number;
  faction?: "a" | "h";
  loadout?: string;
};
export type LeaderboardItem = { id: number; name: string; nameRu?: string; quality?: string; icon?: string; count: number; share: number };
export type LeaderboardHero = {
  id: number;
  name: string;
  count: number;
  share: number;
  top?: { name: string; realm: LeaderboardRealm; score: number; loadout: string };
};
export type LeaderboardSpecSummary = {
  specId: number;
  classId: number;
  role: LeaderboardRole;
  count: number;
  topScore?: number;
  heroes: LeaderboardHero[];
  gearSample: number;
  trinkets: LeaderboardItem[];
  weapons: LeaderboardItem[];
};
export type LeaderboardPage = {
  game: "wow";
  region: LeaderboardRegion;
  status: "live" | "stale";
  season: { id: number; name: string };
  view: { role?: LeaderboardRole; classId?: number; specId?: number; realm?: string; q?: string };
  depth: number;
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  entries: LeaderboardEntry[];
  realms: Array<LeaderboardRealm & { count: number }>;
  leaders?: Partial<Record<LeaderboardRole, LeaderboardEntry[]>>;
  summary?: LeaderboardSpecSummary;
};

export type LeaderboardQuery = {
  region: LeaderboardRegion;
  role?: LeaderboardRole;
  classId?: number;
  specId?: number;
  realm?: string;
  q?: string;
  page?: number;
};

export type LeaderboardSpec = {
  theme: TalentSpecTheme;
  /** Kebab slugs of the class and the spec ("death-knight", "beast-mastery"). */
  classSlug: string;
  color: string;
  icon: string;
};

const kebab = (value: string) => value.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function describe(theme: TalentSpecTheme): LeaderboardSpec {
  const classSlug = kebab(theme.className);
  return {
    theme,
    classSlug,
    color: classColors[classSlug as keyof typeof classColors] ?? "var(--atlas-text-muted)",
    icon: specIcon(theme.specName, classSlug, kebab(theme.specName)) ?? theme.iconUrl,
  };
}

const bySpecId = new Map(talentSpecThemes.map((theme) => [theme.specId, describe(theme)]));

export const leaderboardSpec = (specId: number) => bySpecId.get(specId) ?? (getTalentSpecThemeById(specId) ? describe(getTalentSpecThemeById(specId)!) : null);
export const leaderboardSpecBySlug = (slug: string) => {
  const theme = getTalentSpecTheme(slug);
  return theme ? bySpecId.get(theme.specId) ?? null : null;
};
export const leaderboardRoleOf = (theme: TalentSpecTheme): LeaderboardRole => theme.role === "tank" ? "tank" : theme.role === "healer" ? "healer" : "dps";

/** Classes in the game's order of ids, each with its specializations. */
export const leaderboardClasses = Array.from(new Set(talentSpecThemes.map((theme) => theme.classId)))
  .sort((a, b) => a - b)
  .map((classId) => {
    const specs = talentSpecThemes.filter((theme) => theme.classId === classId).sort((a, b) => a.specId - b.specId).map(describe);
    return { classId, className: specs[0].theme.className, classNameRu: specs[0].theme.classNameRu, color: specs[0].color, specs };
  });

export const heroName = (spec: LeaderboardSpec | null, heroId: number | undefined, locale: "en" | "ru", fallback = "") => {
  const path = heroId ? spec?.theme.heroPaths.find((hero) => hero.id === heroId) : undefined;
  return path ? (locale === "ru" ? path.nameRu : path.name) : fallback;
};

export const realmName = (realm: LeaderboardRealm, locale: "en" | "ru") => (locale === "ru" && realm.nameRu) || realm.name;

/** Query string of a leaderboard view; defaults are left out so URLs stay short. */
export function leaderboardSearch(query: Partial<LeaderboardQuery>, base: Partial<LeaderboardQuery> = {}) {
  const merged = { ...base, ...query };
  const params = new URLSearchParams();
  if (merged.region && merged.region !== "eu") params.set("region", merged.region);
  if (merged.role) params.set("role", merged.role);
  if (merged.classId) params.set("class", String(merged.classId));
  if (merged.specId) params.set("spec", String(merged.specId));
  if (merged.realm) params.set("realm", merged.realm);
  if (merged.q) params.set("q", merged.q);
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

const armoryLocale = { en: { eu: "en-gb", us: "en-us", kr: "ko-kr", tw: "zh-tw" }, ru: { eu: "ru-ru", us: "en-us", kr: "ko-kr", tw: "zh-tw" } } as const;
const lowerName = (name: string) => encodeURIComponent(name.toLocaleLowerCase());

export const armoryUrl = (region: LeaderboardRegion, entry: { name: string; realm: LeaderboardRealm }, locale: "en" | "ru") =>
  `https://worldofwarcraft.blizzard.com/${armoryLocale[locale][region]}/character/${region}/${encodeURIComponent(entry.realm.slug)}/${lowerName(entry.name)}`;

export const raiderIoUrl = (region: LeaderboardRegion, entry: { name: string; realm: LeaderboardRealm }) =>
  `https://raider.io/characters/${region}/${encodeURIComponent(entry.realm.slug)}/${encodeURIComponent(entry.name)}`;

/** Our talent calculator with the player's loadout imported (and its hero tree preselected). */
export const talentsUrl = (spec: LeaderboardSpec, loadout: string, heroId: number | undefined, prefix: string) => {
  const params = new URLSearchParams();
  if (heroId) params.set("hero", String(heroId));
  params.set("import", loadout);
  return `${prefix}/talents/${spec.theme.slug}?${params.toString()}`;
};

export const itemIconUrl = (icon: string) => `https://render.worldofwarcraft.com/eu/icons/56/${icon}.jpg`;

type RawParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
const bounded = (value: string, max: number) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= max ? number : undefined;
};

/** URL search params → a valid query; anything unknown is dropped rather than sent to the API. */
export function parseLeaderboardQuery(params: RawParams, fixedSpecId?: number): LeaderboardQuery {
  const region = first(params.region);
  const role = first(params.role);
  const realm = first(params.realm).toLowerCase();
  const q = first(params.q).trim().slice(0, 40);
  const classId = bounded(first(params.class), 20);
  const specId = fixedSpecId ?? bounded(first(params.spec), 5000);
  return {
    region: isLeaderboardRegion(region) ? region : "eu",
    role: !fixedSpecId && isLeaderboardRole(role) ? role : undefined,
    classId: fixedSpecId ? undefined : classId,
    specId: specId && leaderboardSpec(specId) ? specId : undefined,
    realm: /^[\p{Ll}\p{Lo}0-9'-]{2,64}$/u.test(realm) ? realm : undefined,
    q: q || undefined,
    page: bounded(first(params.page), 100),
  };
}
