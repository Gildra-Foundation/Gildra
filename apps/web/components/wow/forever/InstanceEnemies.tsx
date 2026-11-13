import { Skull } from "lucide-react";
import type { Lang } from "@/lib/i18n-paths";
import { ForeverPanel, foreverIconFrame, foreverPanelStyles } from "./shared";
import styles from "./dungeonGuide.module.css";

export type InstanceEnemy = { name: string; portrait?: string; ability: string; response: Record<Lang, string> };
const frame = foreverIconFrame(56);

/** Dangerous enemies between the bosses: every entry has the same build — portrait, name, ability, what to do. */
export function InstanceEnemies({ enemies, lang }: { enemies: readonly InstanceEnemy[]; lang: Lang }) {
  return <ForeverPanel>
    <ul className={styles.enemies}>{enemies.map(enemy => <li key={enemy.name}>
      <span className={`${foreverPanelStyles.iconFrame} ${styles.portrait}`} style={frame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {enemy.portrait ? <img src={enemy.portrait} width={56} height={56} alt="" loading="lazy" /> : <Skull aria-hidden="true" />}
      </span>
      <div>
        <h3 className={styles.enemyName}>{enemy.name}</h3>
        <p className={styles.ability}>{enemy.ability}</p>
        <p className={styles.enemyText}>{enemy.response[lang]}</p>
      </div>
    </li>)}</ul>
  </ForeverPanel>;
}
