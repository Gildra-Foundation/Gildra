import styles from "./auction.module.css";

/** The auction hall behind the hero, fading into the solid data body (design.md §4.5). Decorative only. */
export function AuctionBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true" data-auction-backdrop>
      <picture className={styles.scene}>
        <source media="(max-width: 600px)" srcSet="/assets/wow/auction/hall-orgrimmar-20261106-mobile.webp" width={640} height={1000} />
        <source media="(max-width: 900px)" srcSet="/assets/wow/auction/hall-orgrimmar-20261106-768.webp 768w, /assets/wow/auction/hall-orgrimmar-20261106.webp 1672w" sizes="100vw" />
        <img src="/assets/wow/auction/hall-orgrimmar-20261106.webp" width="1672" height="941" alt="" loading="eager" fetchPriority="high" decoding="async" />
      </picture>
    </div>
  );
}
