import type { ReactNode } from "react";
import { BookEngraving, type BookEngravingMotif } from "./BookEngraving";
import styles from "./characterAuditPage.module.css";
import book from "./bookSpread.module.css";
import motion from "./characterBookMotion.module.css";
import illumination from "./characterBookIllumination.module.css";

const motifs: Record<string, BookEngravingMotif> = {
  "01": "armory", "02": "talents", "03": "rotation", "04": "logs", "05": "history",
};

export function CharacterBookChapter({ id, index, eyebrow, title, description, icon }: {
  id: string; index: string; eyebrow: string; title: string; description: string; icon: ReactNode;
}) {
  return <header className={`${styles.chapterIntro} ${book.chapter} ${motion.chapter} ${illumination.chapter}`} id={id} data-folio-illuminated data-book-reveal="chapter">
    <div className={`${book.chapterTitle} ${illumination.chapterTitle}`}>
      <span className={styles.chapterIndex} data-folio-chapter>{index}</span>
      <div><small className={illumination.chapterRubric}>{eyebrow}</small><h2>{title}</h2></div>
    </div>
    <div className={`${book.chapterSummary} ${illumination.chapterSummary}`}>
      <div><span className={illumination.chapterSignature} aria-hidden="true">{icon}</span><p>{description}</p></div>
      <BookEngraving motif={motifs[index] ?? "compass"} />
    </div>
  </header>;
}
