import styles from "./auction.module.css";

/** One painted scene behind the hero, fading into the solid data body (design.md §4.5). Decorative only. */
export function AuctionBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true" data-auction-backdrop>
      <div className={styles.scene}>
        <img src="/assets/wow/loading/tools.webp" width="1920" height="1080" alt="" loading="eager" fetchPriority="high" decoding="async" />
      </div>
    </div>
  );
}
