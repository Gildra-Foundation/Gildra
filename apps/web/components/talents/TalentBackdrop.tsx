import styles from "./talentAtlasPage.module.css";

/** The talents scene behind the hero, fading into the solid data body (design.md §4.5). Decorative only. */
export function TalentBackdrop() {
  return <div className={styles.backdrop} aria-hidden="true" data-talent-backdrop>
    <div className={styles.scene}>
      <img src="/assets/wow/loading/talents-wow.webp" width="1920" height="1080" alt="" loading="eager" fetchPriority="high" decoding="async" />
    </div>
  </div>;
}
