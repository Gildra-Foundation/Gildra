import type { RaidBoss, RaidDefinition } from "./midnightRaidData";
import { getRaidTactic } from "./midnightRaidTactics";
import { getVoidspireMechanicGuide } from "./voidspireMechanicGuide";

/**
 * Raids whose battle plan and mechanic guide passed the source review. Other
 * Midnight raids keep their drafted tactics in midnightRaidTactics.ts but show
 * only verified Adventure Guide abilities until that review is done.
 */
const strategyPublishedRaids = new Set<string>(["the-voidspire"]);

export function getBossStrategy(raid: RaidDefinition, boss: RaidBoss) {
  if (!strategyPublishedRaids.has(raid.slug)) return null;
  const tactic = getRaidTactic(boss.slug);
  const guide = getVoidspireMechanicGuide(boss.slug);
  return tactic || guide ? { tactic, guide } : null;
}

export function isRaidStrategyPublished(raid: RaidDefinition) {
  return strategyPublishedRaids.has(raid.slug);
}
