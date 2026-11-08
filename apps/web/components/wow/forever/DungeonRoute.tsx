"use client";
import type { Lang } from "@/lib/i18n-paths";
import type { DungeonGuide } from "./dungeonGuides";
import styles from "./dungeonGuide.module.css";

export function revealEncounter(hash: string, focus = false) {
  if (!/^#encounter-\d+$/.test(hash)) return;
  const target = document.getElementById(hash.slice(1));
  if (!target) return;
  const disclosure = target.querySelector("details");
  if (disclosure) disclosure.open = true;
  if (focus) target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "start", behavior: "instant" });
}

export function DungeonRoute({ steps, bosses, lang }: { steps: NonNullable<DungeonGuide["route"]>; bosses: string[]; lang: Lang }) {
  return <ol className={styles.route}>{steps.map(step => <li key={step.title.en}>
    <h4>{step.title[lang]}</h4>
    <p>{step.description[lang]}</p>
    <ul className={styles.routeBosses}>{step.bosses.map(name => {
      const href = `#encounter-${bosses.indexOf(name) + 1}`;
      return <li key={name}><a href={href} onClick={() => revealEncounter(href, true)}>{name}</a></li>;
    })}</ul>
  </li>)}</ol>;
}
