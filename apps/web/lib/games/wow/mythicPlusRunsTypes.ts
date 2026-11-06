/**
 * Responses of the Mythic+ run endpoints of the Gildra API
 * (GET /v1/meta/wow/mythic-plus/{comps,stats,runs}, dataset mplus-runs-raiderio,
 * backend/internal/gamemeta/mythicplusruns_views.go). Client-safe types and helpers.
 */
export type RunsRole = "tank" | "healer" | "dps";
export const runsRoles: RunsRole[] = ["tank", "healer", "dps"];
export const runsRegions = ["us", "eu", "kr", "tw"] as const;
export type RunsRegion = (typeof runsRegions)[number];

export type RunsSpec = { id: number; class_slug: string; spec_slug: string; class_name: string; spec_name: string; role: RunsRole };
export type RunsDungeon = { id: number; slug: string; name: string; short_name: string; timer_ms: number };
export type RunsGroup = { tank: number; healer: number; dps: [number, number, number] };
export type RunsFilter = { dungeon: string; region: string; minLevel: number; specs: number[] };
export type RunsSample = { runs: number; minLevel: number; maxLevel: number; dungeons: number; from?: string; to?: string };
export type RunStats = { runs: number; maxLevel: number; medianLevel: number; medianTimeLeft: number; upgradeShare: number };

export type RunsEnvelope = {
  game: "wow";
  status: "live" | "stale";
  fetchedAt: string;
  checkedAt?: string;
  season: { slug: string; name: string; short_name: string; starts: string };
  dungeons: RunsDungeon[];
  specs: RunsSpec[];
  regions: string[];
  filter: RunsFilter;
  sample: RunsSample;
  levelRange: { min: number; max: number };
};

export type Composition = RunsGroup & RunStats & { share: number; dungeons: number };
export type FillCandidate = { spec: number; runs: number; share: number; medianLevel: number; maxLevel: number };
export type CompsResponse = RunsEnvelope & {
  minSample: number;
  compositions: Composition[];
  fill: { selected: number[]; matched: number; open: Record<RunsRole, number>; candidates: Record<RunsRole, FillCandidate[]> };
  pairs: Array<{ a: number; b: number; runs: number; lift: number; medianLevel: number }>;
};

export type CutoffTier = { key: string; percent: number; score: number; players: number };
export type RegionCutoffs = {
  updated_at: string | null;
  players: number;
  tiers: CutoffTier[];
  history: Array<{ key: string; points: Array<[string, number]> }>;
  milestones: Array<{ score: number; players: number; share: number }>;
  all_timed: Array<{ level: number; score: number; players: number; share: number }>;
};
export type StatsResponse = RunsEnvelope & {
  overall: RunStats;
  dungeonStats: Array<RunStats & { slug: string }>;
  specPresence: Array<{ spec: number; role: RunsRole; runs: number; presence: number; medianLevel: number }>;
  levels: Array<{ level: number; runs: number }>;
  cutoffs: Partial<Record<RunsRegion, RegionCutoffs>>;
};

export type RunLink = {
  id: number; url: string; dungeon: string; level: number; chests: number; clearMs: number; timerMs: number;
  timeLeft: number; completedAt: string; region: string; group: RunsGroup; video: boolean;
};
export type RunsSort = "level" | "fast" | "recent";
export const runsSorts: RunsSort[] = ["level", "fast", "recent"];
export type RunsResponse = RunsEnvelope & { sort: RunsSort; limit: number; runs: RunLink[] };

export type RunsLoad<T> = { state: "ready"; data: T } | { state: "empty" } | { state: "error" } | { state: "invalid" };

/** Page query (?dungeon=&region=&minLevel=&specs=&sort=&limit=) in its canonical form. */
export type RunsQuery = { dungeon?: string; region?: string; minLevel?: number; specs?: number[]; sort?: RunsSort; limit?: number };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

/** Reads the page's search params leniently: anything malformed is dropped, never thrown. */
export function parseRunsQuery(params: Record<string, string | string[] | undefined>): RunsQuery {
  const query: RunsQuery = {};
  const dungeon = one(params.dungeon);
  if (/^[a-z0-9][a-z0-9-]{0,63}$/.test(dungeon) && dungeon !== "all") query.dungeon = dungeon;
  const region = one(params.region);
  if ((runsRegions as readonly string[]).includes(region)) query.region = region;
  const minLevel = Number(one(params.minLevel));
  if (Number.isInteger(minLevel) && minLevel > 0 && minLevel <= 40) query.minLevel = minLevel;
  const specs = one(params.specs).split(",").map((part) => Number(part)).filter((id) => Number.isInteger(id) && id > 0 && id < 100000);
  if (specs.length) query.specs = specs.slice(0, 5).sort((a, b) => a - b);
  const sort = one(params.sort);
  if ((runsSorts as string[]).includes(sort) && sort !== "level") query.sort = sort as RunsSort;
  const limit = Number(one(params.limit));
  if (Number.isInteger(limit) && limit > 30 && limit <= 100) query.limit = limit;
  return query;
}

/** "?dungeon=…&specs=…" of a query (empty values left out); the same string for the API and page links. */
export function runsSearch(query: RunsQuery): string {
  const search = new URLSearchParams();
  if (query.dungeon) search.set("dungeon", query.dungeon);
  if (query.region) search.set("region", query.region);
  if (query.minLevel) search.set("minLevel", String(query.minLevel));
  if (query.specs?.length) search.set("specs", [...query.specs].sort((a, b) => a - b).join(","));
  if (query.sort && query.sort !== "level") search.set("sort", query.sort);
  if (query.limit) search.set("limit", String(query.limit));
  const text = search.toString().replaceAll("%2C", ",");
  return text ? `?${text}` : "";
}

/** The query with one spec more (when its role still has a free slot) or one fewer. */
export function withSpec(query: RunsQuery, spec: number): RunsQuery {
  return { ...query, specs: [...(query.specs ?? []), spec].sort((a, b) => a - b), limit: undefined };
}
export function withoutSpec(query: RunsQuery, spec: number): RunsQuery {
  const specs = [...(query.specs ?? [])];
  const index = specs.indexOf(spec);
  if (index >= 0) specs.splice(index, 1);
  return { ...query, specs, limit: undefined };
}

/** Minutes and seconds of a duration: 27:54. */
export function clock(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
