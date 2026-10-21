import "server-only";
import reviews from "@/data/wow/raid-reviews/published-reviews.json";
import identities from "@/data/wow/raid-reviews/spell-identities.json";

export type RaidReviewSource = { title: string; url: string };
export type ReviewedRaidBoss = {
  slug: string;
  summaryRu: string;
  summaryEn: string;
  tipsRu: string[];
  tipsEn: string[];
  sources: RaidReviewSource[];
};
export type ReviewedRaid = {
  raidSlug: string;
  reviewedAt: string;
  sources: RaidReviewSource[];
  summaryRu: string;
  summaryEn: string;
  bosses: ReviewedRaidBoss[];
};
export function getRaidReview(raidSlug: string): ReviewedRaid | undefined {
  return (reviews as ReviewedRaid[]).find((review) => review.raidSlug === raidSlug);
}
export function getReviewedSpellIdentities(encounterId?: number, raidSlug?: string, bossSlug?: string) {
  return identities.abilities.filter((ability) => encounterId !== undefined ? ability.encounterId === encounterId : ability.raidSlug === raidSlug && ability.bossSlug === bossSlug);
}
