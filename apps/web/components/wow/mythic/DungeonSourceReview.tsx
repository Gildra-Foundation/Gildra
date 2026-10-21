import type { DungeonSourceReviewData } from "@/lib/data/wow/mythicReview.types";
import { dungeonSourceReviewCopy } from "./dungeonSourceReviewCopy";
import styles from "./mythicAtlasPage.module.css";

export function DungeonSourceReview({ review, locale }: { review: DungeonSourceReviewData; locale: "ru" | "en" }) {
  const copy = dungeonSourceReviewCopy[locale];
  return <section className={styles.verification} aria-labelledby="dungeon-source-review-title" data-testid="dungeon-source-review">
    <h2 id="dungeon-source-review-title">{copy.title}</h2>
    <p>{copy.reviewed}: <time dateTime={review.checkedAt}>{review.checkedAt}</time>. {copy.notice}</p>
    <ul>{review.facts.map((fact,i)=><li key={i}>{fact[locale]}{" "}<a href={fact.source} target="_blank" rel="noreferrer">{copy.source} {i+1}</a></li>)}</ul>
    <details><summary>{copy.differences}</summary><ul>{review.corrections.map((c,i)=><li key={i}>{c[locale]}</li>)}</ul></details>
  </section>;
}
