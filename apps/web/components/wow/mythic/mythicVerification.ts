/** Dates record a completed source check, never the render or deployment time.
 * Tactical review uses the cited current-season author guides and MDT route data.
 */
export const mythicVerification = {
  season: {
    checkedAt: "2026-10-18",
    source: "https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live",
  },
  timers: {
    checkedAt: "2026-10-18",
    source: "https://raider.io/api/v1/mythic-plus/static-data?expansion_id=11",
    seasonSlug: "season-mn-2",
  },
  names: {
    checkedAt: "2026-10-18",
    source: "https://worldofwarcraft.blizzard.com/ru-ru/worldsoul/eu/leaderboards/mythic-dungeon/die-todeskrallen/temple-of-sethraliss",
  },
  patch: {
    value: "12.1.5",
    checkedAt: "2026-10-18",
    source: "https://worldofwarcraft.blizzard.com/en-us/news/24307306/midnight-s-12-1-5-content-update-is-now-live",
  },
  route: { status: "source_reviewed", checkedAt: "2026-10-19" },
} as const;

