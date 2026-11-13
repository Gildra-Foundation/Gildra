"use client";
import { useEffect } from "react";
import type { Lang } from "@/lib/i18n-paths";
import { ForeverPanel } from "./shared/ForeverPanel";
import { ForeverChips } from "./shared/ForeverTabs";
import { hallEncounters } from "./hallOfThanes";
import styles from "./hallGuide.module.css";
import { InstanceMaps } from "./InstanceMaps";
import { navigateDungeon, readDungeonLocation, useDungeonLocation } from "./map/navigation";
import { revealEncounter } from "./DungeonRoute";
import { hallGuideCopy as copy } from "./hallGuideCopy";

/** The encounters of Hall of Thanes: pick one by number, the map centres on its area and the fight opens beside it. */
export function HallGuideClient({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const location = readDungeonLocation(useDungeonLocation());
  const selected = location.encounter !== undefined ? location.encounter - 1 : Math.max(0, hallEncounters.findIndex(boss => boss.floor === (location.mapFloor ?? location.floor ?? 1)));
  const active = selected >= 0 && selected < hallEncounters.length ? selected : 0;
  const encounter = hallEncounters[active];
  useEffect(() => {
    if (location.encounter && location.encounter <= hallEncounters.length) revealEncounter(`#encounter-${location.encounter}`);
  }, [location.encounter]);
  return <>
    <ForeverChips className={styles.choices} label={t.encounters} chips={hallEncounters.map((boss, index) => ({
      label: `${index + 1} · ${boss.name}`, active: active === index,
      onClick: () => { navigateDungeon(`#encounter-${index + 1}`, boss.floor); requestAnimationFrame(() => revealEncounter(`#encounter-${index + 1}`, true)); },
    }))} />
    <div className={styles.workspace}>
      <ForeverPanel>
        <InstanceMaps selectedEncounter={active + 1} lang={lang} name="Hall of Thanes" bosses={hallEncounters.map(boss => boss.name)}
          maps={[{ src: "/images/wow/forever/hall-of-thanes/1.webp", width: 1130, height: 1556, label: { [lang]: t.main } }, { src: "/images/wow/forever/hall-of-thanes/2.webp", width: 654, height: 561, label: { [lang]: t.cave } }]}
          associations={hallEncounters.map((boss, index) => ({ encounter: index + 1, floor: boss.floor, x: boss.x, y: boss.y }))} />
      </ForeverPanel>
      <ForeverPanel as="article" id={`encounter-${active + 1}`} tabIndex={-1} className={styles.encounter} aria-labelledby="hall-boss-name">
        <p className={styles.area}>{encounter.area}</p>
        <h3 className={styles.name} id="hall-boss-name"><span aria-hidden="true">{active + 1}</span>{encounter.name}</h3>
        <p className={styles.note}>{encounter.preparation[lang]}</p>
        <h4>{t.enemies}</h4>
        <ul className={styles.enemies}>{encounter.enemies.map(enemy => <li key={enemy}>{enemy}</li>)}</ul>
        <h4>{t.mechanics}</h4>
        <dl className={styles.mechanics}>{encounter.mechanics.map(mechanic => <div key={mechanic.name}><dt>{mechanic.name}<span>{t[mechanic.role]}</span></dt><dd>{mechanic.response[lang]}</dd></div>)}</dl>
      </ForeverPanel>
    </div>
  </>;
}
