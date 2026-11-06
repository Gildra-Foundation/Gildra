import styles from "./talentAtlasPage.module.css";

/** The talents scene behind the hero, fading into the solid data body (design.md §4.5). Decorative only. */
export function TalentBackdrop() {
  return <div className={styles.backdrop} aria-hidden="true" data-talent-backdrop>
    <div className={styles.scene}>
      <img src="/assets/wow/loading/talents-hall-20261106.webp" srcSet="/assets/wow/loading/talents-hall-20261106-768.webp 768w, /assets/wow/loading/talents-hall-20261106.webp 1672w" sizes="100vw" width="1672" height="941" alt="" loading="eager" fetchPriority="high" decoding="async" />
    </div>
  </div>;
}
