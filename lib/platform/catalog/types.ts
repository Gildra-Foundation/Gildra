import type { PlatformGameId } from "@/lib/platform/home/types";
import { isPlatformGameVisible } from "@/lib/mvp";

export type CatalogGameId = PlatformGameId;
export type ComparisonKind = "items" | "weapons" | "artifact-sets" | "runes";
export type SearchKind = "all" | "characters" | "items";

export type CatalogGameOption = {
  id: CatalogGameId;
  name: string;
  accent: string;
  iconUrl: string;
  available: boolean;
  kinds: Array<{ id: ComparisonKind; label: string }>;
};

export type PlatformCatalogItem = {
  id: string;
  gameId: CatalogGameId;
  kind: ComparisonKind | "characters" | "entities";
  entityType: string;
  name: string;
  description: string;
  iconUrl?: string;
  href: string;
  meta: string[];
  attributes: Record<string, string | number>;
};

export type CatalogQueryResult = {
  items: PlatformCatalogItem[];
  unavailableGames: CatalogGameId[];
};

const allCatalogGames: CatalogGameOption[] = [
  {
    id: "wow",
    name: "World of Warcraft",
    accent: "#50b9e8",
    iconUrl: "/platform/home/game-wow.png",
    available: true,
    kinds: [{ id: "items", label: "Items" }],
  },
  {
    id: "genshin",
    name: "Genshin Impact",
    accent: "#db75d5",
    iconUrl: "/platform/home/game-genshin.png",
    available: true,
    kinds: [{ id: "weapons", label: "Weapons" }, { id: "artifact-sets", label: "Artifact Sets" }],
  },
  {
    id: "diablo",
    name: "Diablo IV",
    accent: "#ff3928",
    iconUrl: "/platform/home/game-diablo.png",
    available: false,
    kinds: [],
  },
  {
    id: "league",
    name: "League of Legends",
    accent: "#e6a13d",
    iconUrl: "/platform/home/game-league.png",
    available: true,
    kinds: [{ id: "items", label: "Items" }, { id: "runes", label: "Runes" }],
  },
];

/** Games the public site lists and searches. WoW-only MVP: the others stay
 *  defined above but are filtered out (lib/mvp.ts, MVP_VISIBLE_GAMES), so
 *  search never offers or links a hidden game's records. */
export const catalogGames: CatalogGameOption[] = allCatalogGames.filter((game) => isPlatformGameVisible(game.id));

export function isCatalogGame(value: string): value is CatalogGameId {
  return catalogGames.some((game) => game.id === value);
}

export function isAvailableKind(gameId: CatalogGameId, value: string): value is ComparisonKind {
  return Boolean(catalogGames.find((game) => game.id === gameId)?.kinds.some((kind) => kind.id === value));
}
