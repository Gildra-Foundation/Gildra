import type { PlatformGameId, PlatformHomeData } from "./types";

/**
 * Presentation-only media upgrades. The persisted snapshot keeps stable,
 * source-agnostic URLs; the web layer resolves them to Retina-ready assets.
 */
const gameIcons: Record<PlatformGameId, string> = {
  wow: "/platform/icons/wow.svg",
  genshin: "/platform/icons/genshin.svg",
  diablo: "/platform/icons/diablo.svg",
  league: "/platform/icons/league.svg",
};

const highResolutionMedia: Record<string, string> = {
  "/platform/home/game-wow.png": gameIcons.wow,
  "/platform/home/game-genshin.png": gameIcons.genshin,
  "/platform/home/game-diablo.png": gameIcons.diablo,
  "/platform/home/game-league.png": gameIcons.league,
  "/assets/specs/fury-warrior.jpg": "/platform/home/fury-hd.png",
  "/platform/home/fury.png": "/platform/home/fury-hd.png",
  "/platform/home/recommend-fury.png": "/platform/home/fury-hd.png",
  "/platform/home/spiritborn.png": "/platform/home/spiritborn-hd.png",
  "/platform/home/recommend-diablo.png": "/platform/home/spiritborn-hd.png",
  "/platform/home/raiden.png": "/genshin-impact/media/genshin/ea6c1839ddf71dd7afcb32a3600c8e113e3445d0bc7cabf3a1a90ae2f1ded1f6.png",
  "/platform/home/recommend-raiden.png": "/genshin-impact/media/genshin/ea6c1839ddf71dd7afcb32a3600c8e113e3445d0bc7cabf3a1a90ae2f1ded1f6.png",
  "/platform/home/ahri.png": "/league-of-legends/media/lol/e5934d486f45e7a0cdefdd16aec31ff52ba6172996b3d316229986b0c7c4595a.jpg",
  "/platform/home/recommend-ahri.png": "/league-of-legends/media/lol/afe0ce6622095ce8a818b68162b88f916ba0e79f7a3621ce7a556ddc21d87770.jpg",
};

function highResolution(url: string) {
  return highResolutionMedia[url] ?? url;
}

export function upgradePlatformHomeMedia(data: PlatformHomeData): PlatformHomeData {
  return {
    ...data,
    games: data.games.map((game) => ({ ...game, iconUrl: gameIcons[game.id] })),
    personalMeta: data.personalMeta.map((entry) => ({ ...entry, focusIconUrl: highResolution(entry.focusIconUrl) })),
    continueItems: data.continueItems.map((entry) => ({ ...entry, imageUrl: highResolution(entry.imageUrl) })),
    savedBuilds: data.savedBuilds.map((entry) => ({ ...entry, imageUrl: highResolution(entry.imageUrl) })),
    recommendations: data.recommendations.map((entry) => ({ ...entry, imageUrl: highResolution(entry.imageUrl) })),
  };
}

export function platformGameIcon(gameId: PlatformGameId) {
  return gameIcons[gameId];
}
