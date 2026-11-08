import { AtlasDisclosure, AtlasGrid, AtlasHero, AtlasMetaList, AtlasSection, AtlasTable } from "@/components/atlas";
import { MaterialLinkButton, MaterialPlaque, materialStyles } from "@/components/wow/shared/materialAtlas";
import { p, type Lang } from "@/lib/i18n-paths";
import { ForeverFrame } from "./ForeverFrame";
import { instanceCopy } from "./instanceCopy";
import { foreverRaids, raidEncounters, instanceSources, newDungeons, returningDungeons, returningDungeonDetails } from "./instanceData";
import styles from "./foreverInstances.module.css";

export function ForeverInstances({ lang, kind }: { lang: Lang; kind: "raids" | "dungeons" }) {
  const t = instanceCopy[lang];
  return <ForeverFrame lang={lang}>
    <AtlasHero align="start" title={t[kind]} lede={kind === "raids" ? t.raidLede : t.dungeonLede}
      breadcrumbs={[{ label: "Forever", href: p(lang, "/wow/forever") }, { label: t[kind] }]}
      breadcrumbsLabel={t.breadcrumbs} />
    {kind === "raids" ? <>
      <AtlasSection>
        <ForeverRaidCards lang={lang} heading="h2" />
      </AtlasSection>
      <AtlasSection title={t.amulet}>
        <MaterialPlaque kit="kings-rest"><p className={materialStyles.text}>{t.amuletText}</p></MaterialPlaque>
      </AtlasSection>
    </> : <>
      <AtlasSection title={t.newDungeons}>
        <ForeverDungeonCards lang={lang} />
      </AtlasSection>
      <AtlasSection title={t.returning}>
        <MaterialPlaque kit="den-of-nalorakk">
          <AtlasTable label={t.returning} rows={returningDungeons} rowKey={row => row[0]} layout="cards"
            columns={[
              { key: "name", header: t.dungeons, rowHeader: true, cell: row => <a href={p(lang, `/wow/forever/dungeons/${returningDungeonDetails.find(item => item.name === row[0])!.slug}`)}>{row[0]}</a> },
              { key: "level", header: t.recommended, numeric: true, cell: row => row[1] },
            ]} />
        </MaterialPlaque>
      </AtlasSection>
    </>}
    <AtlasDisclosure summary={t.sources}>
      <a href={instanceSources[kind]} target="_blank" rel="noreferrer">Blizzard — {t[kind]} ↗</a>
      {kind === "raids" && <a href="https://wowforever.kickegg.net/raids" target="_blank" rel="noreferrer">WoW Forever — {t.bosses} ↗</a>}
      {kind === "dungeons" && <a href={instanceSources.returning} target="_blank" rel="noreferrer">Method — {t.returning} ↗</a>}
    </AtlasDisclosure>
  </ForeverFrame>;
}

/** The three level-60 raids: where, how many players, how many bosses. */
export function ForeverRaidCards({ lang, heading: Heading = "h3" }: { lang: Lang; heading?: "h2" | "h3" }) {
  const t = instanceCopy[lang];
  return <AtlasGrid min={300} fit>
    {foreverRaids.map(raid => <MaterialPlaque key={raid.id} kit="kings-rest" as="article" aria-labelledby={raid.id}>
      <p className={styles.location}>{raid.location}</p>
      <Heading id={raid.id} className={materialStyles.title}>{raid.name}</Heading>
      <AtlasMetaList items={[{ label: t.level, value: 60 }, { label: t.players, value: raid.players }, { label: t.bosses, value: raid.bosses }]} />
      <p className={materialStyles.text}>{raid.text[lang]}</p>
      <AtlasDisclosure summary={t.bosses}><ul>{raidEncounters[raid.id].map(name => <li key={name}>{name}</li>)}</ul></AtlasDisclosure>
    </MaterialPlaque>)}
  </AtlasGrid>;
}

/** The nine new dungeons with their level bands; a guide button where a guide exists. */
export function ForeverDungeonCards({ lang }: { lang: Lang }) {
  const t = instanceCopy[lang];
  return <AtlasGrid min={280} fit>
    {newDungeons.map(dungeon => <MaterialPlaque key={dungeon.name} kit="den-of-nalorakk" as="article">
      <p className={styles.location}>{dungeon.location}</p>
      <h3 className={materialStyles.title}>{dungeon.name}</h3>
      <AtlasMetaList columns={2} items={[{ label: t.level, value: `${dungeon.min}–${dungeon.max}` }, { label: t.players, value: 5 }]} />
      {<MaterialLinkButton kit="den-of-nalorakk" href={p(lang, `/wow/forever/dungeons/${dungeon.slug}`)}>{t.guide}</MaterialLinkButton>}
    </MaterialPlaque>)}
  </AtlasGrid>;
}
