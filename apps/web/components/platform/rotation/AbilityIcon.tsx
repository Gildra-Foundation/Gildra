import type { RotationAbility } from "@/lib/platform/rotation/types";
import styles from "./rotationLab.module.css";

/** Specialization and class portraits are identity art, never an ability's icon. */
const identityArt = /\/assets\/(?:specs|classes)\//;

export function hasAbilityArt(iconUrl: string | undefined): iconUrl is string {
  return Boolean(iconUrl) && !identityArt.test(iconUrl as string);
}

/** Up to two initials of the ability name ("Touch of the Magi" → T, M) for the neutral placeholder. */
function initials(name: string) {
  const words = name.match(/\p{L}[\p{L}\p{M}'’]*/gu) ?? [];
  const major = words.filter((word) => word[0] !== word[0].toLowerCase());
  const letters = (major.length ? major : words).slice(0, 2).map((word) => word[0].toUpperCase());
  return letters.length ? letters : ["?"];
}

export function AbilityIcon({ ability, size = "md" }: { ability: RotationAbility; size?: "sm" | "md" | "lg" }) {
  const sizeClass = `${styles.abilityIcon} ${styles[`abilityIcon${size.toUpperCase()}`]}`;
  // No verified icon: a neutral monogram plate (design rule 7), not a repeated spec portrait.
  if (!hasAbilityArt(ability.iconUrl)) {
    const [first, second] = initials(ability.name);
    return (
      <span className={`${sizeClass} ${styles.abilityIconPlaceholder}`} title={ability.name} data-icon-placeholder="">
        <span aria-hidden="true">{first}{second ? <span>{second}</span> : null}</span>
      </span>
    );
  }
  return (
    <span className={sizeClass} title={ability.name}>
      <img src={ability.iconUrl} alt="" width={56} height={56} loading="lazy" decoding="async" />
    </span>
  );
}
