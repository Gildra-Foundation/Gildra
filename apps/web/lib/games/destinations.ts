import { GAMES } from "./registry";
import { p, type Lang } from "@/lib/i18n-paths";

// Announcements are separate destinations: showing them never enables the
// unfinished game catalogs, search results or fixture-backed hubs.
export const gameDestinations = [
  { id: "wow", name: GAMES.wow.name, shortName: "WoW", path: "/", icon: "/platform/icons/wow.svg", soon: false },
  { id: "wow-forever", name: "WoW Forever", shortName: "WoW Forever", path: "/games/wow-forever", icon: "/platform/icons/wow.svg", art: "/assets/wow/character-book/intro/icecrown-home-background-v1.webp", soon: true },
  // No Diablo IV scene with confirmed provenance in the project: a neutral frame instead of WoW art.
  { id: "diablo-4", name: GAMES["diablo-4"].name, shortName: "Diablo IV", path: "/games/diablo-4", icon: "/platform/icons/diablo.svg", art: undefined, soon: true },
] as const;

export type GameDestination = typeof gameDestinations[number];
export type UpcomingGame = Extract<GameDestination, { soon: true }>;

export function upcomingGame(id: string): UpcomingGame | undefined {
  return gameDestinations.find((game): game is UpcomingGame => game.soon && game.id === id);
}

export function gameDestinationForPath(pathname: string): GameDestination {
  const path = pathname.replace(/^\/ru(?=\/|$)/, "").replace(/\/$/, "") || "/";
  return gameDestinations.find((game) => game.path === path) ?? gameDestinations[0];
}

export const gameDestinationHref = (game: GameDestination, lang: Lang) => p(lang, game.path);
