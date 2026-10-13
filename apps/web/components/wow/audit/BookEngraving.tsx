import styles from "./characterBookIllumination.module.css";

export type BookEngravingMotif = "armory" | "talents" | "rotation" | "logs" | "history" | "compass";

/** Decorative ink only: never a substitute for a real item or ability icon. */
export function BookEngraving({ motif, className = "" }: { motif: BookEngravingMotif; className?: string }) {
  return <span className={`${styles.engraving} ${className}`} data-engraving={motif} data-book-reveal="ornament" aria-hidden="true" />;
}
