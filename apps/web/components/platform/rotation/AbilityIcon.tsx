import type { RotationAbility } from "@/lib/platform/rotation/types";
import styles from "./rotationLab.module.css";

export function AbilityIcon({ ability, size = "md" }: { ability: RotationAbility; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`${styles.abilityIcon} ${styles[`abilityIcon${size.toUpperCase()}`]}`} title={ability.name}>
      <img src={ability.iconUrl} alt="" width={56} height={56} loading="lazy" decoding="async" />
    </span>
  );
}
