import Image from "next/image";
import { MapPin } from "lucide-react";
import { AtlasSection } from "@/components/atlas";
import { p, type Lang } from "@/lib/i18n-paths";
import { ForeverFrame } from "./ForeverFrame";
import { ForeverArtCard, ForeverArtGrid, ForeverHero, ForeverPanel, foreverPanelStyles } from "./shared";
import { bossCount, instanceCopy, playerCount } from "./instanceCopy";
import { foreverRaids, raidEncounters, newDungeons } from "./instanceData";
import { ForeverDungeonCatalog } from "./ForeverDungeonCatalog";
import { instanceArt, instanceDoorPosition } from "./instanceArt";
import { allDungeons, dungeonFacts } from "./instanceFacts";
import { instanceName } from "./instanceLocalization";
import styles from "./foreverInstances.module.css";

export function ForeverInstances({ lang, kind }: { lang: Lang; kind: "raids" | "dungeons" }) {
  const t = instanceCopy[lang];
  const dungeons = allDungeons.map(dungeon => dungeonFacts(dungeon, lang));
  const raids = kind === "raids";
  return <ForeverFrame lang={lang} page={kind}>
    <ForeverHero lang={lang} trail={[{ label: t[kind] }]} title={t[kind]} lede={raids ? t.raidLede : t.dungeonLede}
      stats={raids
        ? [{ value: foreverRaids.length, label: t.raids }, { value: foreverRaids.reduce((sum, raid) => sum + raid.bosses, 0), label: t.bosses }, { value: 60, label: t.level }]
        : [{ value: dungeons.length, label: t.dungeons }, { value: dungeons.reduce((sum, dungeon) => sum + dungeon.bosses, 0), label: t.bosses }, { value: `${dungeons[0].min}–60`, label: t.level }]} />
    {raids ? <>
      <AtlasSection>
        <div className={styles.raids} data-forever-cascade="">
          {foreverRaids.map(raid => <ForeverRaid key={raid.id} raid={raid} lang={lang} />)}
        </div>
      </AtlasSection>
      <AtlasSection title={t.amulet}>
        <ForeverPanel><p className={foreverPanelStyles.text}>{t.amuletText}</p></ForeverPanel>
      </AtlasSection>
    </> : <AtlasSection><ForeverDungeonCatalog lang={lang} dungeons={dungeons} /></AtlasSection>}
  </ForeverFrame>;
}

/** One raid of the journal: its painting in the Forever frame beside a panel with the facts and the roster. */
function ForeverRaid({ raid, lang }: { raid: typeof foreverRaids[number]; lang: Lang }) {
  const t = instanceCopy[lang];
  const painting = instanceArt(raid.id);
  return <article id={raid.id} className={styles.raid} aria-labelledby={`${raid.id}-name`}>
    <ForeverPanel className={styles.raidFrame} aria-hidden="true">
      <div className={styles.raidArt}>{painting && <Image src={painting.src} alt="" fill sizes="(max-width: 900px) 100vw, 50vw" style={{ objectPosition: painting.position }} />}</div>
    </ForeverPanel>
    <ForeverPanel className={styles.raidBody}>
      <p className={styles.location}><MapPin aria-hidden="true" /><span>{instanceName(raid.location, lang)}</span></p>
      <h2 id={`${raid.id}-name`} className={styles.raidName}>{raid.name}</h2>
      <p className={styles.raidFacts}><span>{t.level} 60</span><span>{playerCount(raid.players, lang)}</span><span>{bossCount(raid.bosses, lang)}</span></p>
      <p className={foreverPanelStyles.text}>{raid.text[lang]}</p>
      <h3 className={styles.rosterTitle}>{t.bosses}</h3>
      <ol className={styles.roster}>{raidEncounters[raid.id].map((name, index) => <li key={name}><span aria-hidden="true">{index + 1}</span>{name}</li>)}</ol>
    </ForeverPanel>
  </article>;
}

/** The three level-60 raids as doors of the Forever hub: painting, name, place, group size; a door opens the raid in the journal. */
export function ForeverRaidCards({ lang }: { lang: Lang }) {
  const t = instanceCopy[lang];
  return <ForeverArtGrid label={t.raids} min={240} fit strip>
    {foreverRaids.map(raid => <ForeverArtCard key={raid.id} href={`${p(lang, "/wow/forever/raids")}#${raid.id}`} art={instanceArt(raid.id)!.src} artPosition={instanceDoorPosition(raid.id)}
      title={raid.name} note={instanceName(raid.location, lang)} badge={playerCount(raid.players, lang)} sizes="(max-width: 700px) 62vw, 33vw" />)}
  </ForeverArtGrid>;
}

/** The nine new dungeons as doors of the Forever hub: painting, name, place, level band; a door opens the guide. */
export function ForeverDungeonCards({ lang }: { lang: Lang }) {
  const t = instanceCopy[lang];
  return <ForeverArtGrid className={styles.nine} label={t.newDungeons} min={140} strip>
    {newDungeons.map(dungeon => dungeonFacts(dungeon, lang)).map(d => <ForeverArtCard key={d.slug} href={p(lang, `/wow/forever/dungeons/${d.slug}`)} art={instanceArt(d.slug)!.src} artPosition={instanceDoorPosition(d.slug)}
      title={d.name} note={d.location} badge={`${d.min}–${d.max}`} ratio="3 / 4" sizes="(max-width: 700px) 62vw, (max-width: 1100px) 25vw, 160px" />)}
  </ForeverArtGrid>;
}
