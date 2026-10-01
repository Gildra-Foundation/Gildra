/**
 * Game registry — the single source of game identity, URL prefix, navigation,
 * footer, legal notice and SEO defaults. Client-safe: plain data only, so a
 * GameDefinition can be passed from server to client components as a prop.
 *
 * URL = `[/ru]` + `game.prefix` + game-relative path. WoW owns the site root
 * (prefix ""), every other game lives under `/<slug>/`.
 *
 * All human-readable strings are EN dictionary keys — render them through
 * `t(lang)` / `tNav(lang)` from lib/i18n.ts and extend the RU dictionary.
 */
import { altPath, p, type Lang } from "@/lib/i18n-paths";

export type GameSlug =
  | "wow"
  | "league-of-legends"
  | "diablo-4"
  | "hearthstone"
  | "overwatch-2";

export type GameStatus = "live" | "beta" | "soon";
export type ApiLocale = "en_US" | "ru_RU";

export type NavTask = {
  task: string;
  title: string;
  desc: string;
  /** Game-relative path ("/tier-lists", "/#raid"). */
  path: string;
  icon: `#ic-${string}`;
};

/** A plain, crawlable link to a real page (game-relative path). */
export type SectionLink = { label: string; path: string };

export type FooterLink =
  | { label: string; path: string }
  | { label: string; soon: true }
  | { label: string; external: string };

export type GameTheme = Partial<
  Record<
    "--bg" | "--panel" | "--panel-2" | "--line" | "--gold" | "--gold-2" | "--gold-dim" | "--blue" | "--blue-2",
    string
  >
>;

export type GameDefinition = {
  slug: GameSlug;
  name: string;
  shortName: string;
  prefix: "" | `/${string}`;
  status: GameStatus;
  icon: `#gm-${string}`;
  /** Switcher tile colour. */
  accent: string;
  locales: readonly Lang[];
  apiLocale: Record<Lang, ApiLocale>;
  nav: {
    tasks: NavTask[];
    /** Main sections as plain links: footer Content column and the cover-page nav. */
    sections?: SectionLink[];
  };
  footer: {
    tagline: string;
    columns: { title: string; links: FooterLink[] }[];
    source?: { label: string; external: string };
  };
  legal: string;
  theme?: GameTheme;
  seo: { titleSuffix: string; defaultDescription: string; ogImage?: string };
  cacheTags: string[];
  /** Catalog API product slug when the game is served by the catalog. */
  catalogProduct?: string;
};

/** Real WoW pages only (each exists under app/ and renders without a session).
 *  Order = importance. Never point these at homepage anchors: `/` is the cover
 *  page and has no sections. */
const wowSections: SectionLink[] = [
  { label: "Characters", path: "/wow/characters" },
  { label: "Dungeons", path: "/wow/dungeons" },
  { label: "Mythic+", path: "/wow/mythic-plus" },
  { label: "Raids", path: "/wow/raids" },
  { label: "Classes", path: "/wow/classes" },
  { label: "Tier Lists", path: "/tier-lists" },
  { label: "Database", path: "/database" },
];

const wow: GameDefinition = {
  slug: "wow",
  name: "World of Warcraft",
  shortName: "WoW",
  prefix: "",
  status: "live",
  icon: "#gm-wow",
  accent: "#c9a24f",
  locales: ["en", "ru"],
  apiLocale: { en: "en_US", ru: "ru_RU" },
  nav: {
    tasks: [
      {
        task: "Compare specs",
        title: "Tier Lists",
        desc: "Specialization rankings and filters",
        path: "/tier-lists",
        icon: "#ic-star",
      },
      {
        task: "Choose a class",
        title: "Classes",
        desc: "Classes, specializations and talents",
        path: "/wow/classes",
        icon: "#ic-sword",
      },
      {
        task: "Prepare for raid",
        title: "Raids",
        desc: "Midnight raid routes and bosses",
        path: "/wow/raids",
        icon: "#ic-shield",
      },
      {
        task: "Push your key",
        title: "Mythic+",
        desc: "Dungeon routes and tactics",
        path: "/wow/mythic-plus",
        icon: "#ic-map",
      },
    ],
    sections: wowSections,
  },
  footer: {
    tagline: "Gaming intelligence for Azeroth — raid journals, Mythic+ routes and character tools.",
    columns: [
      {
        title: "Content",
        links: wowSections,
      },
      {
        title: "Community",
        links: [
          { label: "Discord", soon: true },
          { label: "Support Us", soon: true },
          { label: "Contact", soon: true },
        ],
      },
    ],
  },
  legal:
    "World of Warcraft® and all related artwork are trademarks or registered trademarks of Blizzard Entertainment, Inc. Gildra is an unofficial fan-made concept and is not affiliated with or endorsed by Blizzard Entertainment.",
  seo: {
    titleSuffix: "Gildra",
    defaultDescription:
      "Live World of Warcraft tier lists, Mythic+ and raid meta statistics, builds and guides.",
  },
  cacheTags: [],
  catalogProduct: "wow",
};

const leagueOfLegends: GameDefinition = {
  slug: "league-of-legends",
  name: "League of Legends",
  shortName: "LoL",
  prefix: "/league-of-legends",
  status: "beta",
  icon: "#gm-lol",
  accent: "#6f9fdc",
  locales: ["en", "ru"],
  apiLocale: { en: "en_US", ru: "ru_RU" },
  nav: {
    tasks: [
      {
        task: "Browse champions",
        title: "Champions",
        desc: "Every champion, ability and skin",
        path: "/",
        icon: "#ic-sword",
      },
      {
        task: "Explore game data",
        title: "Items",
        desc: "Complete localized item database",
        path: "/content/items",
        icon: "#ic-bag",
      },
      {
        task: "Plan a build",
        title: "Runes",
        desc: "Rune trees and keystones",
        path: "/content/runes",
        icon: "#ic-spark",
      },
      {
        task: "Prepare for lane",
        title: "Summoner Spells",
        desc: "Summoner spells with cooldowns",
        path: "/content/summoner-spells",
        icon: "#ic-scroll",
      },
    ],
  },
  footer: {
    tagline: "League of Legends champion, item and rune database with official Data Dragon assets.",
    columns: [
      {
        title: "Content",
        links: [
          { label: "Champions", path: "/" },
          { label: "Items", path: "/content/items" },
          { label: "Runes", path: "/content/runes" },
          { label: "Summoner Spells", path: "/content/summoner-spells" },
        ],
      },
    ],
    source: {
      label: "Official Data Dragon source ↗",
      external: "https://developer.riotgames.com/docs/lol#data-dragon",
    },
  },
  legal:
    "League of Legends and Riot Games are trademarks of Riot Games, Inc. Gildra is not affiliated with Riot Games.",
  seo: {
    titleSuffix: "Gildra",
    defaultDescription:
      "Every League of Legends champion, ability, skin and official Data Dragon asset in one bilingual database.",
  },
  theme: {
    "--bg": "#080b10",
    "--panel": "#10151d",
    "--line": "#252e3b",
    "--gold": "#c9a85b",
    "--gold-2": "#dcc07a",
    "--blue": "#6f9fdc",
    "--blue-2": "#8fb5e2",
  },
  cacheTags: ["league-catalog"],
};

const soon = (
  slug: GameSlug,
  name: string,
  shortName: string,
  icon: `#gm-${string}`,
  accent: string,
): GameDefinition => ({
  slug,
  name,
  shortName,
  prefix: `/${slug}`,
  status: "soon",
  icon,
  accent,
  locales: ["en", "ru"],
  apiLocale: { en: "en_US", ru: "ru_RU" },
  nav: { tasks: [] },
  footer: { tagline: "", columns: [] },
  legal: "",
  seo: { titleSuffix: "Gildra", defaultDescription: "" },
  cacheTags: [],
});

export const GAMES: Record<GameSlug, GameDefinition> = {
  wow,
  "league-of-legends": leagueOfLegends,
  "diablo-4": soon("diablo-4", "Diablo IV", "D4", "#gm-d4", "#d95c55"),
  hearthstone: soon("hearthstone", "Hearthstone", "HS", "#gm-hs", "#dfc06a"),
  "overwatch-2": soon("overwatch-2", "Overwatch 2", "OW2", "#gm-ow", "#e8975a"),
};

/** Display order in the game switcher. */
export const GAME_ORDER: readonly GameSlug[] = [
  "wow",
  "league-of-legends",
  "diablo-4",
  "hearthstone",
  "overwatch-2",
];

/**
 * MVP gate: the public site is World of Warcraft only. Every other game stays
 * fully defined above (so it can come back) but is not linked from the game
 * switcher, nav, footer, search or sitemaps, and its routes answer 404 through
 * `hiddenForMvp()` in lib/mvp.ts. To bring a game back, add its slug here.
 */
export const MVP_VISIBLE_GAMES: readonly GameSlug[] = ["wow"];

export const isGameVisible = (slug: GameSlug) => MVP_VISIBLE_GAMES.includes(slug);

/** Games visitors may see, in switcher order. */
export const visibleGames = () => GAME_ORDER.filter(isGameVisible).map((s) => GAMES[s]);

export const liveGames = () => visibleGames().filter((g) => g.status !== "soon");

/** Game-relative path → site path without language. Accepts "/", "/x/y",
 *  "/#anchor" and bare "#anchor". */
export function gamePath(game: GameDefinition, path: string): string {
  if (path.startsWith("#") || !game.prefix) return path;
  if (path === "/") return game.prefix;
  if (path.startsWith("/#")) return `${game.prefix}${path.slice(1)}`;
  return `${game.prefix}${path}`;
}

/** The only link builder pages and blocks should use for internal links. */
export const gameHref = (game: GameDefinition, lang: Lang, path: string) =>
  p(lang, gamePath(game, path));

/** Game for a pathname (client components with usePathname). Strips the
 *  /ru prefix first; longest matching game prefix wins; WoW is the default.
 *  Hidden games never match, so a 404 under a hidden prefix keeps WoW chrome. */
export function currentGame(pathname: string | null): GameDefinition {
  const bare = pathname ? altPath(pathname, "en") : "/";
  return (
    visibleGames().find(
      (g) =>
        g.prefix &&
        (bare === g.prefix || bare.startsWith(`${g.prefix}/`) || bare.startsWith(`${g.prefix}#`)),
    ) ?? GAMES.wow
  );
}

/** "/ru/league-of-legends/champions/x" → "/champions/x"; "/ru" → "/". */
export function gameRelativePath(pathname: string): string {
  const bare = altPath(pathname, "en");
  const game = currentGame(bare);
  if (!game.prefix) return bare;
  const rest = bare.slice(game.prefix.length);
  return rest === "" ? "/" : rest;
}
