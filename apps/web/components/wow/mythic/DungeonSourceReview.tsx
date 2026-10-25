import type { DungeonSourceReviewData } from "@/lib/data/wow/mythicReview.types";
import { dungeonSourceReviewCopy } from "./dungeonSourceReviewCopy";
import styles from "./mythicAtlasPage.module.css";

export function DungeonSourceReview({ review, locale }: { review: DungeonSourceReviewData; locale: "ru" | "en" }) {
  const copy = dungeonSourceReviewCopy[locale];
  return <details className={styles.verification} data-testid="dungeon-source-review">
    <summary>{copy.title} · <time dateTime={review.checkedAt}>{review.checkedAt}</time></summary>
    <p>{copy.reviewed}: <time dateTime={review.checkedAt}>{review.checkedAt}</time>. {copy.notice}</p>
    <ul>{review.facts.map((fact,i)=><li key={i}>{fact[locale]}{" "}<a href={fact.source} target="_blank" rel="noreferrer">{copy.source} {i+1}</a></li>)}</ul>
    <details><summary>{copy.differences}</summary><ul>{review.corrections.map((c,i)=><li key={i}>{c[locale]}</li>)}</ul></details>
  </details>;
}
