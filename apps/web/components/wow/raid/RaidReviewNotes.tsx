import { AtlasSection } from "@/components/atlas";
import { getRaidReview } from "@/lib/data/raidReviews";
import { raidReviewCopy } from "./raidReviewCopy";
import styles from "./raidReview.module.css";
import page from "./raidPage.module.css";
import { RaidPlaque } from "./raidMaterial";
import type { RaidHubSlug } from "./raidHubData";

/** Reviewed editorial advice; separate from guarded Adventure Guide descriptions. */
export function RaidReviewNotes({ raidSlug, bossSlug, locale }: { raidSlug: string; bossSlug?: string; locale: "ru" | "en" }) {
  const reviewCopy = raidReviewCopy[locale];
  const review = getRaidReview(raidSlug);
  if (!review) return null;
  const boss = bossSlug ? review.bosses.find((entry) => entry.slug === bossSlug) : undefined;
  if (bossSlug && !boss) return null;
  const content = boss ?? review;
  const tips = boss ? (locale === "ru" ? boss.tipsRu : boss.tipsEn) : [];
  return (
    <AtlasSection id="reviewed-notes" title={boss ? reviewCopy.beforePull : reviewCopy.overview}>
      <RaidPlaque raid={raidSlug as RaidHubSlug} className={page.plaque} data-testid="raid-reviewed-notes">
        <p className={styles.summary}>{locale === "ru" ? content.summaryRu : content.summaryEn}</p>
        {tips.length ? <ul className={styles.tips}>{tips.map((tip) => <li key={tip}>{tip}</li>)}</ul> : null}
      </RaidPlaque>
    </AtlasSection>
  );
}
