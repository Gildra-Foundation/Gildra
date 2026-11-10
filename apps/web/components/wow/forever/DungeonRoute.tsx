"use client";
import type { Lang } from "@/lib/i18n-paths";
import type { DungeonGuide } from "./dungeonGuides";
import styles from "./dungeonGuide.module.css";
import mapStyles from "./map/map.module.css";
import { readDungeonLocation, useDungeonLocation } from "./map/navigation";
import { mapCopy } from "./map/mapCopy";

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
  const location = readDungeonLocation(useDungeonLocation());
  return <ol className={styles.route}>{steps.map((step, index) => <li key={step.title.en} id={`route-${index + 1}`} className={mapStyles.step} data-active={location.route === index + 1 || (location.encounter !== undefined && step.bosses.includes(bosses[location.encounter - 1]))}>
    <h4><a href={`#route-${index + 1}`} aria-label={`${mapCopy[lang].step}: ${step.title[lang]}`}>{step.title[lang]}</a></h4>
    <p>{step.description[lang]}</p>
    <ul className={styles.routeBosses}>{step.bosses.map(name => {
      const index = bosses.indexOf(name);
      if (index < 0) return <li key={name}>{name}</li>;
      const href = `#encounter-${index + 1}`;
      return <li key={name}><a href={href} onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) revealEncounter(href, true); }}>{name}</a></li>;
    })}</ul>
  </li>)}</ol>;
}
