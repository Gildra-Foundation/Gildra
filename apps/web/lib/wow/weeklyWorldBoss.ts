export type WorldBossRegion = "eu" | "us" | "kr" | "tw";
export type WeeklyWorldBossRecord = { region: WorldBossRegion; slug: string; season: string; sourceUrl: string; verifiedAt: string; startsAt: string; expiresAt: string };
export function confirmedWeeklyBoss(records: WeeklyWorldBossRecord[], region: WorldBossRegion, now: number) {
  const matches = records.filter(record => record.region === region && record.season === "midnight-season-2"
    && /^https:\/\//.test(record.sourceUrl) && Number.isFinite(Date.parse(record.verifiedAt))
    && Date.parse(record.verifiedAt) <= now && Date.parse(record.startsAt) <= now && now < Date.parse(record.expiresAt)
    && Date.parse(record.verifiedAt) < Date.parse(record.expiresAt));
  // Conflicting current records are not a confirmed weekly selection.
  return matches.length === 1 ? matches[0] : null;
}
