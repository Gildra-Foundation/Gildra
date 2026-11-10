"use client";
import { useEffect, type ReactNode } from "react";
import { AtlasDisclosure, AtlasGrid, AtlasHero, AtlasMetaList, AtlasSection } from "@/components/atlas";
import { MaterialPlaque, materialStyles } from "@/components/wow/shared/materialAtlas";
import { p, type Lang } from "@/lib/i18n-paths";
import { ForeverFrame } from "./ForeverFrame";
import { hallEncounters, hallSources, hallTrash } from "./hallOfThanes";
import styles from "./hallGuide.module.css";
import { InstanceMaps } from "./InstanceMaps";
import { navigateDungeon, readDungeonLocation, useDungeonLocation } from "./map/navigation";
import { revealEncounter } from "./DungeonRoute";
import { hallGuideCopy as copy } from "./hallGuideCopy";

export function HallGuideClient({ lang, loot }: { lang: Lang; loot: ReactNode }) {
  const t = copy[lang];
  const location = readDungeonLocation(useDungeonLocation());
  const selected = location.encounter !== undefined ? location.encounter - 1 : Math.max(0, hallEncounters.findIndex(boss => boss.floor === (location.mapFloor ?? location.floor ?? 1)));
  const active = selected >= 0 && selected < hallEncounters.length ? selected : 0;
  const encounter = hallEncounters[active];
  useEffect(() => {
    if (location.encounter && location.encounter <= hallEncounters.length) revealEncounter(`#encounter-${location.encounter}`);
  }, [location.encounter]);
  return <ForeverFrame lang={lang}>
    <AtlasHero title="Hall of Thanes" align="start" lede={t.entrance} breadcrumbsLabel={t.breadcrumb} breadcrumbs={[{ label: "WoW — Forever", href: p(lang, "/wow/forever") }, { label: t.dungeons, href: p(lang, "/wow/forever/dungeons") }, { label: "Hall of Thanes" }]} />
    <AtlasMetaList items={[{ label: t.level, value: "13–18" }, { label: t.players, value: 5 }]} />
    <nav className={styles.choices} aria-label={t.encounters}>{hallEncounters.map((boss, index) => <a key={boss.id} href={`?mapFloor=${boss.floor}#encounter-${index + 1}`} aria-current={active === index ? "true" : undefined} onClick={event => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); navigateDungeon(`#encounter-${index + 1}`, boss.floor);
            requestAnimationFrame(() => revealEncounter(`#encounter-${index + 1}`, true));
          }}>{index + 1}. {boss.name}</a>)}</nav>
    <AtlasSection title={t.map}>
      <div className={styles.workspace}>
        <MaterialPlaque kit="den-of-nalorakk">
          <InstanceMaps selectedEncounter={active + 1} lang={lang} name="Hall of Thanes" bosses={hallEncounters.map(boss => boss.name)}
            maps={[{ src: "/images/wow/forever/hall-of-thanes/1.webp", width: 1130, height: 1556, label: { [lang]: t.main } }, { src: "/images/wow/forever/hall-of-thanes/2.webp", width: 654, height: 561, label: { [lang]: t.cave } }]}
            associations={hallEncounters.map((boss, index) => ({ encounter: index + 1, floor: boss.floor, x: boss.x, y: boss.y }))} />
        </MaterialPlaque>
        <div>

          <MaterialPlaque kit="den-of-nalorakk" as="article" id={`encounter-${active + 1}`} tabIndex={-1} className={styles.encounter} aria-labelledby="hall-boss-name">
            <p className={materialStyles.text}>{encounter.area}</p>
            <h2 className={materialStyles.title} id="hall-boss-name">{encounter.name}</h2>
            <p className={materialStyles.text}>{encounter.preparation[lang]}</p>
            <h3>{t.enemies}</h3><ul>{encounter.enemies.map(enemy => <li key={enemy}>{enemy}</li>)}</ul>
            <h3>{t.mechanics}</h3><dl className={styles.mechanics}>{encounter.mechanics.map(mechanic => <div key={mechanic.name}><dt>{mechanic.name} <span>{t[mechanic.role]}</span></dt><dd>{mechanic.response[lang]}</dd></div>)}</dl>
          </MaterialPlaque>
        </div>
      </div>
    </AtlasSection>
    <AtlasSection title={t.trash}><AtlasGrid min={260} fit>{hallTrash.map(enemy => <MaterialPlaque kit="den-of-nalorakk" as="article" key={enemy.name}><h3 className={materialStyles.title}>{enemy.name}</h3><p className={styles.ability}>{enemy.ability}</p><p className={materialStyles.text}>{enemy.response[lang]}</p></MaterialPlaque>)}</AtlasGrid></AtlasSection>
    <AtlasSection title={t.before}><MaterialPlaque kit="den-of-nalorakk"><h3 className={materialStyles.title}>{t.pack}</h3><p className={materialStyles.text}>{t.packText}</p></MaterialPlaque></AtlasSection>
    {loot}
    <AtlasDisclosure summary={t.sources}>{hallSources.map(([label, href]) => <a key={href} href={href} target="_blank" rel="noreferrer">{label} ↗</a>)}</AtlasDisclosure>
  </ForeverFrame>;
}
