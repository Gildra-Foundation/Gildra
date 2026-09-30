import styles from "./platformAtmosphere.module.css";

/** Static, composited ambience shared by platform pages. */
export function PlatformAtmosphere({ accent = "#d88b2b" }: { accent?: string }) {
  return (
    <div className={styles.atmosphere} style={{ "--atmosphere-accent": accent } as React.CSSProperties} aria-hidden="true">
      <div className={styles.grid} />
      <div className={styles.constellation}><i /><i /><i /><i /><i /><i /></div>
      <div className={styles.sigil}><i /><b /></div>
      <div className={styles.mistA} />
      <div className={styles.mistB} />
      <div className={styles.pointerGlow} />
      <div className={styles.noise} />
    </div>
  );
}
