"use client";

import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import type { RaidPullPlan } from "./raidPullTypes";
import { raidPullRouteCopy } from "./raidPullRouteCopy";
import { raidPullCopy } from "./raidPullCopy";
import styles from "./raidPullRoute.module.css";

/** The same ordered groups and calls remain available with every background. */
export function RaidPullRouteList({ plan, active, locale, onSelect }: {
  plan: RaidPullPlan; active: number; locale: "ru" | "en"; onSelect: (index: number, reveal?: boolean) => void;
}) {
  const t = raidPullCopy[locale];
  const copy = raidPullRouteCopy[locale];
  if (plan.slug !== "the-voidspire" || plan.encounter) return null;
  return <section className={styles.route} data-raid-pull-route-list aria-label={copy.label}>
    <h4>{copy.title}</h4>
    <p>{copy.intro}</p>
    <ol>{plan.pulls.map((pull, index) => {
      const kicks = pull.abilities.filter(ability => ability.action === "interrupt");
      const boss = plan.bosses.find(item => item.slug === pull.bossSlug);
      const nextPull = plan.pulls[index + 1];
      const bossStop = boss && (!nextPull || nextPull.bossSlug !== pull.bossSlug);
      return <li key={pull.id} data-raid-route-pull={pull.id} data-active={active === index}>
        <AtlasButton variant="ghost" className={styles.choice} aria-pressed={active === index} aria-controls={`raid-pull-${plan.slug}`} onClick={() => onSelect(index, true)}>
          <b>{index + 1}</b><span><strong>{pull.title[locale]}</strong><small>{pull.kind === "rally" ? (copy.rally) : pull.enemies.map(enemy => enemy.name[locale]).join(" · ")}</small></span>
        </AtlasButton>
        <div className={styles.orders}>
          {pull.kind !== "rally" && <p data-raid-route-kicks><b>{t.actions.interrupt}: </b>{kicks.length ? kicks.map(ability => `${ability.caster?.[locale]} — ${ability.name[locale]}`).join("; ") : (copy.noKick)}</p>}
          <p>{pull.call[locale]}</p>
          {pull.direction && <p className={styles.direction}>{pull.direction[locale]}</p>}
          {bossStop && <p className={styles.stop}><b>{copy.boss}</b>{boss.name[locale]}{nextPull && <> → {t.pull} {index + 2}</>}</p>}
        </div>
      </li>;
    })}</ol>
    <p className={styles.note}>{copy.note}</p>
  </section>;
}
