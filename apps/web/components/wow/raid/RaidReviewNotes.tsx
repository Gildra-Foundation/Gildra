import { AtlasDisclosure, AtlasSection } from "@/components/atlas";
import { formatAtlasDate } from "@gildra/atlas-ui/format";
import { getRaidReview } from "@/lib/data/raidReviews";
import { raidReviewCopy } from "./raidReviewCopy";
import styles from "./raidReview.module.css";

/** Reviewed editorial advice; separate from guarded Adventure Guide descriptions. */
export function RaidReviewNotes({ raidSlug, bossSlug, locale }: { raidSlug: string; bossSlug?: string; locale: "ru" | "en" }) {
  const reviewCopy = raidReviewCopy[locale];
  const review = getRaidReview(raidSlug);
  if (!review) return null;
  const boss = bossSlug ? review.bosses.find((entry) => entry.slug === bossSlug) : undefined;
  if (bossSlug && !boss) return null;
  const content = boss ?? review;
  const tips = boss ? (locale === "ru" ? boss.tipsRu : boss.tipsEn) : [];
  const sources = content.sources;
  return (
    <AtlasSection id="reviewed-notes" title={boss ? reviewCopy.beforePull : reviewCopy.overview}>
      <div className={styles.notes} data-testid="raid-reviewed-notes">
        <p>{locale === "ru" ? content.summaryRu : content.summaryEn}</p>
        {tips.length ? <ul className={styles.tips}>{tips.map((tip) => <li key={tip}>{tip}</li>)}</ul> : null}
        <AtlasDisclosure summary={reviewCopy.sources}>
          <p className={styles.date}>{reviewCopy.reviewed}: {formatAtlasDate(review.reviewedAt, locale)}</p>
          <ul className={styles.sources}>{sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
        </AtlasDisclosure>
      </div>
    </AtlasSection>
  );
}
