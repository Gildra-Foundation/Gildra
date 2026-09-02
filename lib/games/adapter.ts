/**
 * Per-game adapter: only what the shared chrome (search, icons) needs from a
 * game. Deliberately small — tier lists, meta and catalogs stay game-specific
 * modules imported by that game's page definitions.
 */
import type { Lang } from "@/lib/i18n";
import type { GameSlug } from "./registry";
import { wowAdapter } from "./wow/client";
import { leagueAdapter } from "./league-of-legends/client";

export type SearchItem = {
  group: string;
  label: string;
  /** Game-relative path — resolved with gameHref(game, lang, path). */
  path: string;
  img?: string | null;
  sprite?: string;
};

export type GameAdapter = {
  slug: GameSlug;
  /** Client-safe, synchronous search index (pages + known entities). */
  searchIndex: (lang: Lang) => SearchItem[];
  /** Groups in display order; unknown groups go last. */
  searchGroups: readonly string[];
  /** Groups shown before the user types. */
  searchDefaultGroups: readonly string[];
};

const ADAPTERS: Partial<Record<GameSlug, GameAdapter>> = {
  wow: wowAdapter,
  "league-of-legends": leagueAdapter,
};

const empty = (slug: GameSlug): GameAdapter => ({
  slug,
  searchIndex: () => [],
  searchGroups: [],
  searchDefaultGroups: [],
});

export const getAdapter = (slug: GameSlug): GameAdapter => ADAPTERS[slug] ?? empty(slug);
