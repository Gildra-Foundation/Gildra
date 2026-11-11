import { AtlasDisclosure, AtlasGrid, AtlasHero, AtlasMetaList, AtlasSection } from "@/components/atlas";
import { MaterialLinkButton, MaterialPlaque, materialStyles } from "@/components/wow/shared/materialAtlas";
import { p, type Lang } from "@/lib/i18n-paths";
import { FOREVER_KIT } from "./foreverKit";
import { ForeverFrame } from "./ForeverFrame";
import { instanceCopy } from "./instanceCopy";
import { foreverRaids, raidEncounters, newDungeons } from "./instanceData";
import { ForeverDungeonCatalog } from "./ForeverDungeonCatalog";
import { instanceName } from "./instanceLocalization";
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
        <MaterialPlaque kit={FOREVER_KIT}><p className={materialStyles.text}>{t.amuletText}</p></MaterialPlaque>
      </AtlasSection>
    </> : <AtlasSection><ForeverDungeonCatalog lang={lang} /></AtlasSection>}
  </ForeverFrame>;
}

/** The three level-60 raids: where, how many players, how many bosses. */
export function ForeverRaidCards({ lang, heading: Heading = "h3" }: { lang: Lang; heading?: "h2" | "h3" }) {
  const t = instanceCopy[lang];
  return <AtlasGrid min={300} fit>
    {foreverRaids.map(raid => <MaterialPlaque key={raid.id} kit={FOREVER_KIT} as="article" aria-labelledby={raid.id}>
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
  return <AtlasGrid min={320} fit>
    {newDungeons.map(dungeon => <MaterialPlaque key={instanceName(dungeon.name, lang)} kit={FOREVER_KIT} as="article">
      <p className={styles.location}>{instanceName(dungeon.location, lang)}</p>
      <h3 className={materialStyles.title}>{instanceName(dungeon.name, lang)}</h3>
      <AtlasMetaList columns={2} items={[{ label: t.level, value: `${dungeon.min}–${dungeon.max}` }, { label: t.players, value: 5 }]} />
      {<MaterialLinkButton kit={FOREVER_KIT} fit="block" href={p(lang, `/wow/forever/dungeons/${dungeon.slug}`)}>{t.guide}</MaterialLinkButton>}
    </MaterialPlaque>)}
  </AtlasGrid>;
}
