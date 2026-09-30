import styles from "./warcraftFrame.module.css";

/** Original World Map frame, sliced in CSS so its corners keep their proportions. */
export function WarcraftFrame() {
  return <span className={styles.frame} aria-hidden="true">
    <i className={styles.top} /><i className={styles.bottom} />
    <i className={styles.left} /><i className={styles.right} />
    <i className={styles.topLeft} /><i className={styles.topRight} />
    <i className={styles.bottomLeft} /><i className={styles.bottomRight} />
  </span>;
}
