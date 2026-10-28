import { Fragment, type ReactNode } from "react";
import Image from "next/image";
import type { RaidPullAbility } from "./raidPullTypes";
import styles from "./raidAbilityText.module.css";

/** Match the actual localized spell identity; never guess a spell from prose. */
export function RaidAbilityText({ value, abilities, locale }: { value: string; abilities: RaidPullAbility[]; locale: "ru" | "en" }) {
  const named = abilities.filter(ability => ability.icon && ability.name[locale]);
  const parts: ReactNode[] = [];
  let rest = value;
  while (rest) {
    const match = named.map(ability => ({ ability, index: rest.indexOf(ability.name[locale]) }))
      .filter(item => item.index >= 0).sort((a, b) => a.index - b.index || b.ability.name[locale].length - a.ability.name[locale].length)[0];
    if (!match) { parts.push(rest); break; }
    parts.push(rest.slice(0, match.index));
    parts.push(<span className={styles.spell} data-raid-inline-spell={match.ability.spellId} key={parts.length}>
      <Image src={match.ability.icon!} width={22} height={22} alt="" aria-hidden="true" />{match.ability.name[locale]}
    </span>);
    rest = rest.slice(match.index + match.ability.name[locale].length);
  }
  return <>{parts.map((part, index) => <Fragment key={index}>{part}</Fragment>)}</>;
}
