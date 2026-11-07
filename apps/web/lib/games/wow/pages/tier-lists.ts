import { notFound, permanentRedirect } from "next/navigation";
import { definePage } from "@/lib/pages/definePage";
import { GAMES, gameHref } from "@/lib/games/registry";
import type { Lang } from "@/lib/i18n";
import type { PvpBracket, TierMode } from "@/components/blocks/wow/tierWorkspace/tierSourceKeys";
import { bracketOfSlug, legacyTierMode, restOfQuery, tierModeMeta, tierModePath } from "@/components/blocks/wow/tierWorkspace/tierModes";

type Search = Record<string, string | string[] | undefined>;

/** An old `?activity=raid|pvp&bracket=…` address answers 308 to the mode's own page (other options travel along). */
function redirectLegacy(lang: Lang, search: Search, mode: TierMode, bracket: PvpBracket = "3v3") {
  const legacy = legacyTierMode(search);
  const hasKey = ["activity", "mode", "bracket"].some((key) => search[key] !== undefined);
  if (!hasKey) return;
  const target = legacy.mode ?? mode;
  const targetBracket = legacy.bracket ?? (target === mode ? bracket : "3v3");
  permanentRedirect(`${gameHref(GAMES.wow, lang, tierModePath(target, targetBracket))}${restOfQuery(search)}`);
}

const modePage = (mode: TierMode, bracket?: PvpBracket) => ({
  id: "wow/tier-lists",
  game: "wow" as const,
  path: tierModePath(mode, bracket),
  layout: "default" as const,
  // Atlas page: the block renders its own AtlasFrame (frame, hero and legal footer).
  blocks: [{ type: "wow.tierWorkspace" as const, props: { mode, bracket } }],
});

/** The page of one mode without a bracket: /tier-lists (Mythic+), /tier-lists/raid, /tier-lists/arena (3v3). */
const modeRoute = (mode: TierMode) => definePage<Record<never, never>, Search>({
  game: "wow",
  path: () => tierModePath(mode),
  readsSearch: true,
  load: async ({ lang, search }) => { redirectLegacy(lang, search, mode); return undefined; },
  meta: ({ lang }) => tierModeMeta(lang, mode),
  page: () => modePage(mode),
});

export const tierListsPage = modeRoute("mythic_plus");
export const tierListsRaidPage = modeRoute("raid");
export const tierListsArenaPage = modeRoute("pvp");

/** /tier-lists/arena/<bracket>: 2v2, Solo Shuffle, Blitz, RBG (3v3 is /tier-lists/arena). */
export const tierListBracketPage = definePage<{ bracket: string }, Search, PvpBracket>({
  game: "wow",
  path: ({ bracket }) => `/tier-lists/arena/${bracket}`,
  readsSearch: true,
  load: async ({ lang, params, search }) => {
    if (params.bracket === "3v3" || params.bracket === "shuffle") permanentRedirect(`${gameHref(GAMES.wow, lang, tierModePath("pvp", params.bracket))}${restOfQuery(search)}`);
    const bracket = bracketOfSlug(params.bracket);
    if (!bracket) notFound();
    redirectLegacy(lang, search, "pvp", bracket);
    return bracket;
  },
  meta: ({ lang, data }) => tierModeMeta(lang, "pvp", data),
  page: ({ data }) => modePage("pvp", data),
});
