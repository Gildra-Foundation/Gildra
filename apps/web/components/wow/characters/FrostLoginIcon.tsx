import Image from "next/image";
import styles from "./frostLogin.module.css";

export type FrostLoginIconKind = "lock" | "equipment" | "talents" | "combat";

/** Painted decoration accompanies an explicit text label; never a game-data icon. */
export function FrostLoginIcon({ kind, compact = false }: { kind: FrostLoginIconKind; compact?: boolean }) {
  return <span className={`${styles.materialIcon} ${compact ? styles.compactIcon : ""}`} aria-hidden="true" data-frost-icon={kind}>
    <Image src={`/assets/wow/characters/frost-login/icons/${kind}.webp`} alt="" width={144} height={144} sizes={compact ? "26px" : "40px"} />
  </span>;
}
