/** The address of each tier-list mode: Mythic+ is /tier-lists, the raids /tier-lists/raid, the arena
 *  /tier-lists/arena (3v3) and /tier-lists/arena/<bracket>. Shared by the routes (title, description,
 *  canonical), the sitemap and the client workspace (it moves the address when the mode changes). */
import type { Lang } from "@/lib/i18n-paths";
import { PVP_BRACKETS, type PvpBracket, type TierMode } from "./tierSourceKeys";

/** The bracket part of an arena address; 3v3 is the arena page itself. */
const BRACKET_SLUGS: Record<PvpBracket, string> = { "3v3": "", "2v2": "2v2", shuffle: "solo-shuffle", blitz: "blitz", rbg: "rbg" };

/** Bracket of an address part (`solo-shuffle` → shuffle); 3v3 has no part of its own. */
export function bracketOfSlug(slug: string): PvpBracket | null {
  return PVP_BRACKETS.find((bracket) => BRACKET_SLUGS[bracket] === slug && slug !== "") ?? null;
}

/** Brackets with an address of their own (the arena page is 3v3). */
export const ARENA_BRACKET_SLUGS = PVP_BRACKETS.map((bracket) => BRACKET_SLUGS[bracket]).filter(Boolean);

/** Language-less path of a mode (and arena bracket). */
export function tierModePath(mode: TierMode, bracket: PvpBracket = "3v3") {
  if (mode === "raid") return "/tier-lists/raid";
  if (mode === "pvp") return BRACKET_SLUGS[bracket] ? `/tier-lists/arena/${BRACKET_SLUGS[bracket]}` : "/tier-lists/arena";
  return "/tier-lists";
}

/** Every mode address, for the sitemap. */
export const tierModePaths = (): string[] => [
  tierModePath("mythic_plus"),
  tierModePath("raid"),
  ...PVP_BRACKETS.map((bracket) => tierModePath("pvp", bracket)),
];

const bracketNames: Record<PvpBracket, string> = { "3v3": "3v3", "2v2": "2v2", shuffle: "Solo Shuffle", blitz: "Blitz", rbg: "RBG" };

/** Title and description of a mode's page. */
export function tierModeMeta(lang: Lang, mode: TierMode, bracket: PvpBracket = "3v3"): { title: string; description: string } {
  const name = bracketNames[bracket];
  if (lang === "ru") {
    if (mode === "raid") return {
      title: "Тир-лист рейдов Midnight: лучшие специализации — Gildra",
      description: "Тир-лист специализаций для рейдов Midnight: танки, лекари и бойцы по сложностям и боссам, сводный тир Gildra и списки ведущих источников.",
    };
    if (mode === "pvp") return {
      title: `Тир-лист ${bracket === "rbg" || bracket === "blitz" ? "PvP" : "арены"} ${name}: лучшие специализации — Gildra`,
      description: `Тир-лист специализаций для ${bracket === "rbg" ? "рейтинговых полей боя (RBG)" : bracket === "blitz" ? "рейтингового режима Blitz" : `рейтинговой арены ${name}`} по рейтинговой таблице Blizzard: популярность в топе, рейтинг и доля побед по регионам EU и US.`,
    };
    return {
      title: "Тир-листы: Эпохальный+, рейды и арена — Gildra",
      description: "Тир-листы специализаций для «Эпохального+», рейдов и арены (3v3, 2v2, Solo Shuffle, Blitz, RBG): сводный тир Gildra, ведущие источники и их сравнение.",
    };
  }
  if (mode === "raid") return {
    title: "Midnight Raid Tier List: Best Specs — Gildra",
    description: "Specialization tier list for Midnight raids: tanks, healers and damage dealers by difficulty and boss, with Gildra's overall tier and the leading sources' lists.",
  };
  if (mode === "pvp") return {
    title: `${name} ${bracket === "rbg" || bracket === "blitz" ? "PvP" : "Arena"} Tier List: Best Specs — Gildra`,
    description: `Specialization tier list for ${bracket === "rbg" ? "rated battlegrounds (RBG)" : bracket === "blitz" ? "Battleground Blitz" : `${name} rated arena`} from the Blizzard PvP ladder: share of the top players, rating and win rate in EU and US.`,
  };
  return {
    title: "Mythic+, Raid & Arena Tier Lists — Gildra",
    description: "Specialization tier lists for Mythic+, raids and arena (3v3, 2v2, Solo Shuffle, Blitz, RBG): Gildra's overall tier, leading sources and a side-by-side view.",
  };
}

/** What an old `?activity=…&bracket=…` address asked for (each part null when it names none). */
export function legacyTierMode(search: Record<string, string | string[] | undefined>): { mode: TierMode | null; bracket: PvpBracket | null } {
  const one = (key: string) => { const value = search[key]; return Array.isArray(value) ? value[0] : value; };
  const activity = one("activity") ?? one("mode");
  const mode: TierMode | null = activity === "raid" ? "raid" : activity === "pvp" || activity === "arena" ? "pvp" : activity === "mythic_plus" ? "mythic_plus" : null;
  const raw = one("bracket");
  const bracket = (PVP_BRACKETS as readonly string[]).includes(raw ?? "") ? raw as PvpBracket : null;
  return { mode, bracket };
}

/** The query string left after the mode moved into the path. */
export function restOfQuery(search: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (key === "activity" || key === "mode" || key === "bracket" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}
