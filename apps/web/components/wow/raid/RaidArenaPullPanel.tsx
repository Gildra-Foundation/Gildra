import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { RaidPull } from "./raidPullTypes";
import { raidPullCopy } from "./raidPullCopy";
import { RaidAbilityText } from "./RaidAbilityText";
import styles from "./raidArenaPull.module.css";

export function RaidArenaRoster({ pull, locale }: { pull: RaidPull; locale: "ru" | "en" }) {
  const t = raidPullCopy[locale];
  return <section className={styles.roster} data-raid-arena-roster={pull.id} aria-label={t.enemies}>
    <h4>{t.enemies}</h4>
    {pull.enemies.length ? <ul>{pull.enemies.map(enemy => <li key={enemy.npcId ?? enemy.name.en} data-raid-arena-enemy={enemy.npcId}>
      {enemy.artwork && <Image src={enemy.artwork} alt="" width={32} height={32} unoptimized />}
      <span className={styles.identity}>{enemy.npcId ? <a href={`https://www.wowhead.com/${locale === "ru" ? "ru/" : ""}npc=${enemy.npcId}`} target="_blank" rel="noreferrer">{enemy.count !== undefined && `${enemy.count} × `}{enemy.name[locale]}<ArrowUpRight size={12} aria-hidden="true" /></a> : <strong>{enemy.name[locale]}</strong>}</span>
      <small data-priority={enemy.priority}>{t[enemy.priority]}</small>
    </li>)}</ul> : <p>{t.noEnemies}</p>}
  </section>;
}

export function RaidArenaActions({ pull, locale }: { pull: RaidPull; locale: "ru" | "en" }) {
  const t = raidPullCopy[locale];
  return <section className={styles.actions} data-raid-arena-actions={pull.id} aria-label={t.call}>
    <h4>{t.call}</h4>
    <p><RaidAbilityText value={pull.call[locale]} abilities={pull.abilities} locale={locale} /></p>
    {pull.abilities.length > 0 && <dl>{pull.abilities.map(ability => <div key={ability.spellId ?? ability.name.en} data-raid-arena-ability={ability.spellId}>
      <dt>{ability.icon && <Image src={ability.icon} alt="" width={24} height={24} unoptimized />}
        {ability.action && <b>{t.actions[ability.action]}: </b>}{ability.name[locale]}</dt>
      {ability.response && <dd><RaidAbilityText value={ability.response[locale]} abilities={pull.abilities} locale={locale} /></dd>}
    </div>)}</dl>}
  </section>;
}
