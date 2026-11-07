"use client";
import { useState } from "react";
import { AtlasGrid, AtlasHero, AtlasMetaList, AtlasSection, AtlasTabs } from "@/components/atlas";
import { MaterialPlaque, materialStyles } from "@/components/wow/shared/materialAtlas";
import { p, type Lang } from "@/lib/i18n-paths";
import { ForeverFrame } from "./ForeverFrame";
import { hallEncounters, hallTrash } from "./hallOfThanes";
import styles from "./hallGuide.module.css";
import { hallGuideCopy as copy } from "./hallGuideCopy";

export function HallGuide({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const [active, setActive] = useState(0);
  const [floor, setFloor] = useState("1");
  const encounter = hallEncounters[active];
  function select(index: number) { setActive(index); setFloor(String(hallEncounters[index].floor)); }
  return <ForeverFrame lang={lang}>
    <AtlasHero title="Hall of Thanes" align="start" lede={t.entrance} breadcrumbsLabel={t.breadcrumb} breadcrumbs={[{ label: "Forever", href: p(lang, "/wow/forever") }, { label: t.dungeons, href: p(lang, "/wow/forever/dungeons") }, { label: "Hall of Thanes" }]} />
    <AtlasMetaList items={[{ label: t.level, value: "13–18" }, { label: t.players, value: 5 }]} />
    <AtlasSection title={t.map}>
      <div className={styles.workspace}>
        <MaterialPlaque kit="den-of-nalorakk">
          <AtlasTabs label={t.map} value={floor} onChange={setFloor} tabs={[1, 2].map(part => ({ id: String(part), label: part === 1 ? t.main : t.cave, content: <div className={styles.map}>
            {/* Client minimap art, preserved without repainting or generated geography. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/images/wow/forever/hall-of-thanes/${part}.webp`} alt={`${t.map}: ${part === 1 ? t.main : t.cave}`} width={part === 1 ? 1130 : 654} height={part === 1 ? 1556 : 561} />
            {hallEncounters.map((boss, index) => boss.floor === part && <button key={boss.id} type="button" className={styles.pin} style={{ left: `${boss.x}%`, top: `${boss.y}%` }} aria-label={boss.name} aria-pressed={active === index} aria-controls="hall-encounter" onClick={() => select(index)}>{index + 1}</button>)}
          </div> }))} />
        </MaterialPlaque>
        <div>
          <nav className={styles.choices} aria-label={t.encounters}>{hallEncounters.map((boss, index) => <button type="button" key={boss.id} aria-pressed={active === index} aria-controls="hall-encounter" onClick={() => select(index)}>{index + 1}. {boss.name}</button>)}</nav>
          <MaterialPlaque kit="den-of-nalorakk" as="article" id="hall-encounter" aria-labelledby="hall-boss-name">
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
  </ForeverFrame>;
}
