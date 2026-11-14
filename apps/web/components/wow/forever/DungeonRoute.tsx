"use client";
import type { Lang } from "@/lib/i18n-paths";
import type { DungeonGuide } from "./dungeonGuides";
import styles from "./dungeonGuide.module.css";
import mapStyles from "./map/map.module.css";
import { navigateDungeon, readDungeonLocation, useDungeonLocation } from "./map/navigation";
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

/** A boss as the route names it: the guide's name is the key, the label is what the page shows. */
export type RouteBoss = { name: string; label: string; portrait?: string };

/** The way through the dungeon as numbered steps beside the map; each step names the bosses it leads to. */
export function DungeonRoute({ steps, bosses, lang }: { steps: NonNullable<DungeonGuide["route"]>; bosses: RouteBoss[]; lang: Lang }) {
  const location = readDungeonLocation(useDungeonLocation());
  const names = bosses.map(boss => boss.name);
  return <ol className={styles.route}>{steps.map((step, index) => <li key={step.title.en} id={`route-${index + 1}`} className={`${styles.step} ${mapStyles.step}`} data-active={location.route === index + 1 || (location.encounter !== undefined && step.bosses.includes(names[location.encounter - 1]))}>
    <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
    <h4><a href={`#route-${index + 1}`} aria-label={`${mapCopy[lang].step}: ${step.title[lang]}`} onClick={event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); navigateDungeon(`#route-${index + 1}`);
    }}>{step.title[lang]}</a></h4>
    <p>{step.description[lang]}</p>
    <ul className={styles.routeBosses}>{step.bosses.map(name => {
      const index = names.indexOf(name);
      if (index < 0) return <li key={name}><span className={styles.routeBoss}>{name}</span></li>;
      const boss = bosses[index];
      const href = `#encounter-${index + 1}`;
      return <li key={name}><a className={styles.routeBoss} href={href} onClick={event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        // The address and the step's mark change together, whatever the browser does with the anchor.
        event.preventDefault(); navigateDungeon(href); revealEncounter(href, true);
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {boss.portrait && <img src={boss.portrait} width={28} height={28} alt="" loading="lazy" />}{boss.label}
      </a></li>;
    })}</ul>
  </li>)}</ol>;
}
