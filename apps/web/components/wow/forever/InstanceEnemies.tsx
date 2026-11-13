import { Skull } from "lucide-react";
import { MaterialPlaque, materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import type { Lang } from "@/lib/i18n-paths";
import { FOREVER_KIT } from "./foreverKit";
import styles from "./dungeonGuide.module.css";

export type InstanceEnemy = { name: string; portrait?: string; ability: string; response: Record<Lang, string> };
const frame = materialIconFrameStyle(FOREVER_KIT, 56);

/** Dangerous enemies between the bosses: every entry has the same build — portrait, name, ability, what to do. */
export function InstanceEnemies({ enemies, lang }: { enemies: readonly InstanceEnemy[]; lang: Lang }) {
  return <MaterialPlaque kit={FOREVER_KIT}>
    <ul className={styles.enemies}>{enemies.map(enemy => <li key={enemy.name}>
      <span className={`${materialStyles.iconFrame} ${styles.portrait}`} style={frame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {enemy.portrait ? <img src={enemy.portrait} width={56} height={56} alt="" loading="lazy" /> : <Skull aria-hidden="true" />}
      </span>
      <div>
        <h3 className={styles.enemyName}>{enemy.name}</h3>
        <p className={styles.ability}>{enemy.ability}</p>
        <p className={styles.enemyText}>{enemy.response[lang]}</p>
      </div>
    </li>)}</ul>
  </MaterialPlaque>;
}
