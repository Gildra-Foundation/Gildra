import type { RaidDefinition } from "@/components/wow/raid/midnightRaidData";
import type { BossGuide } from "@gildra/game-data";
import type { DungeonRoute } from "@/components/wow/mythic/dungeonRoutes";
import type { DungeonCombatIntel } from "@/components/wow/mythic/dungeonCombatIntel.types";
import type { getBossStrategy } from "@/components/wow/raid/raidStrategy";
import type { ReviewedRaid, ReviewedSpellIdentity } from "@/lib/data/raidReviews";

export type Edition = "retail" | "forever";
export type Locale = "en" | "ru";
export type Names = { en: string; ru: string };
export type ContentContext = {
  game: "wow"; edition: Edition; channel: "live"; region: "global";
  progressionKind: "none"; progressionId: null;
};
export type Catalog = {
  schemaVersion: 1; releaseId: string; contentHash: string; generation: number;
  context: ContentContext; modules: Record<string, string>; publishedAt: string;
};
export type SeasonIdentity = { slug: string; number: number; names: Names; source: string; checkedAt: string };
export type PublishedIdentity = {
  canonicalSlug: string; instance?: string; order?: number; patch?: string; build: string | null;
  names: { en: string; ru: string | null }; descriptions: { en: string | null; ru: string | null };
  sourceUrl?: string; lastVerifiedAt?: string; verificationStatus?: string;
};
export type RaidCatalogEntry = {
  slug: string; entityId: string; season: string; patch: string; names: { en: string; ru: string | null }; localeFallback: "en" | null;
  descriptions: { en: string | null; ru: string | null }; artwork: string | null;
  sourceUrl: string; lastVerifiedAt: string; verificationStatus: string;
  bosses: { slug: string; names: { en: string; ru: string | null }; artwork?: string }[];
};
export type RaidPayload = {
  edition: Edition;
  catalog: { season: SeasonIdentity; currentRaidSlug: string; entries: RaidCatalogEntry[] };
  manifest: { instances: PublishedIdentity[]; encounters: PublishedIdentity[]; seasons: { canonicalSlug: string; names: Names }[] };
  legacyRaids: Record<string, RaidDefinition>;
  venomousBosses: BossGuide[];
  venomousIntel: Omit<typeof import("@/components/wow/raid/venomousAbyssIntel"), "lootBandIndexForBoss">;
  difficulties: typeof import("@gildra/game-data").difficulties;
  strategies: Record<string, ReturnType<typeof getBossStrategy>>;
  reviews: ReviewedRaid[];
  spellIdentities: ReviewedSpellIdentity[];
};
export type PublishedDungeon = DungeonRoute & {
  bossCount: number; bossCountSource: string; bossCountVerificationStatus: string;
};
export type VerificationItem = { checkedAt: string; source: string };
export type MythicVerification = {
  season: VerificationItem;
  timers: VerificationItem & { seasonSlug: string };
  names: VerificationItem;
  patch: VerificationItem & { value: string };
  route: { status: string; checkedAt: string | null };
};
export type MythicPayload = {
  edition: Edition; catalog: { season: SeasonIdentity; dungeonOrder: string[] };
  dungeons: Record<string, PublishedDungeon>;
  combatIntel: Record<string, DungeonCombatIntel>;
  verification: MythicVerification;
};
export type ModulePayloads = { raids: RaidPayload; "mythic-plus": MythicPayload };
export type PublishedContent<K extends keyof ModulePayloads> = {
  release: Catalog; payload: ModulePayloads[K]; stale: boolean;
};
