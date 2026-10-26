"use client";

import Image from "next/image";
import Link from "next/link";
import { Flag, Skull } from "lucide-react";
import type { RaidPullPlan } from "./raidPullTypes";
import { raidPullCopy } from "./raidPullCopy";
import styles from "./raidPulls.module.css";

// These are schematic callout offsets, not changes to the source route.
// Keep every 44px target separate even in a 320px viewport.
const pullPosition = (pull: RaidPullPlan["pulls"][number]) => pull.id === "voidspire-02" ? { x: 29, y: 65 } : pull;
const bossPosition = (boss: RaidPullPlan["bosses"][number]) => ({ x: Math.min(90, boss.x + 24), y: boss.slug === "vaelgor-ezzorak" ? boss.y - 4 : boss.y });

export function RaidSchematicMap({ plan, active, locale, onSelect, background }: { plan: RaidPullPlan; active: number; locale: "ru" | "en"; onSelect: (index: number, reveal?: boolean) => void; background: "grid" | "art" }) {
  const t = raidPullCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  return <figure className={styles.mapFigure} style={{ position: "static" }} data-raid-schematic>
    <figcaption><span>{t.map}</span><small>{t.schematic}</small></figcaption>
    <div className={styles.mapViewport} role="group" aria-label={`${t.map}: ${plan.name[locale]}`}>
      <div className={styles.mapPlane} data-raid-map-plane data-background={background}>
        <Image src={plan.artwork} alt="" fill sizes="(max-width: 900px) 560px, 700px" className={styles.mapArt} />
        <svg className={styles.mapLines} viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="none">
          <path className={styles.corridor} d={plan.routePath} />
          {plan.pulls.map((pull) => <circle className={styles.room} key={pull.id} cx={pullPosition(pull).x} cy={pullPosition(pull).y} r={6} />)}
          <path className={styles.routeLine} d={plan.routePath} />
          {plan.bosses.map((boss) => <path className={styles.bossBranch} key={boss.slug} d={`M ${boss.x} ${boss.y} H ${bossPosition(boss).x} V ${bossPosition(boss).y}`} />)}
        </svg>
        <span className={styles.entrance} style={{ left: `${plan.entrance.x}%`, top: `${plan.entrance.y}%` }}><Flag size={16} aria-hidden="true" />{t.entrance}</span>
        {plan.pulls.map((pull, index) => <button key={pull.id} type="button" className={styles.mapMarker}
          style={{ left: `${pullPosition(pull).x}%`, top: `${pullPosition(pull).y}%` }} aria-pressed={index === active}
          aria-controls={`raid-pull-${plan.slug}`} aria-label={`${t.pull} ${index + 1}: ${pull.title[locale]}`}
          data-raid-pull-marker={index} onClick={() => onSelect(index, true)}>{index + 1}</button>)}
        {plan.bosses.map((boss, index) => <Link key={boss.slug} className={styles.bossMarker}
          style={{ left: `${bossPosition(boss).x}%`, top: `${bossPosition(boss).y}%` }} href={`${prefix}/wow/raids/${plan.slug}/${boss.slug}`}
          aria-label={`${t.boss} ${index + 1}: ${boss.name[locale]}`} title={boss.name[locale]}>
          {boss.artwork ? <Image src={boss.artwork} alt="" width={42} height={42} /> : <Skull aria-hidden="true" />}
        </Link>)}
      </div>
    </div>
    <p className={styles.legend}><span><b>1</b>{t.pull}</span>{plan.bosses.length > 0 && <span><Skull size={16} aria-hidden="true" />{t.boss}</span>}<span><Flag size={16} aria-hidden="true" />{t.entrance}</span></p>
    <p className={styles.mapNote}>{plan.note[locale]}</p>
  </figure>;
}
