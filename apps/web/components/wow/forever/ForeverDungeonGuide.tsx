import { notFound } from "next/navigation";
import { AtlasDisclosure, AtlasGrid, AtlasHero, AtlasMetaList, AtlasSection } from "@/components/atlas";
import { MaterialPlaque, materialStyles } from "@/components/wow/shared/materialAtlas";
import { p, type Lang } from "@/lib/i18n-paths";
import { ForeverFrame } from "./ForeverFrame";
import { dungeonGuideCopy } from "./dungeonGuideCopy";
import { dungeonGuides } from "./dungeonGuides";
import { newDungeons, returningDungeonDetails } from "./instanceData";
import { InstanceLoot } from "./InstanceLoot";
import { DungeonEncounters } from "./DungeonEncounters";
import { DungeonRoute } from "./DungeonRoute";
import { InstanceMaps } from "./InstanceMaps";
import { hallGuideCopy } from "./hallGuideCopy";
import styles from "./dungeonGuide.module.css";

export function ForeverDungeonGuide({ lang, slug }: { lang: Lang; slug: string }) {
  const guide = dungeonGuides[slug];
  const dungeon = [...newDungeons, ...returningDungeonDetails].find(item => item.slug === slug);
  if (!guide || !dungeon) notFound();
  const t = hallGuideCopy[lang];
  const c = dungeonGuideCopy[lang];
  const mapLabel = c.map;
  return <ForeverFrame lang={lang}>
    <AtlasHero title={dungeon.name} align="start" lede={guide.entrance[lang]} breadcrumbsLabel={t.breadcrumb} breadcrumbs={[{ label: "WoW — Forever", href: p(lang, "/wow/forever") }, { label: t.dungeons, href: p(lang, "/wow/forever/dungeons") }, { label: dungeon.name }]} />
    <AtlasMetaList items={[{ label: t.level, value: `${dungeon.min}–${dungeon.max}` }, { label: t.players, value: 5 }]} />
    <div className={styles.workspace}>
      <AtlasSection title={mapLabel}>
        <MaterialPlaque kit="den-of-nalorakk">
          {guide.preparation?.map(note => <p key={note.en} className={materialStyles.text}>{note[lang]}</p>)}
          {guide.maps ? <InstanceMaps maps={guide.maps} name={dungeon.name} lang={lang} /> : <a className={styles.mapLink} href={guide.map} target="_blank" rel="noreferrer" aria-label={`${mapLabel}: ${dungeon.name} (${c.original})`}>
            {guide.viewBox ? <svg className={styles.map} viewBox={guide.viewBox} role="img" aria-label={`${mapLabel}: ${dungeon.name}`}><image href={guide.map} width="2048" height="2048" /></svg> :
              /* eslint-disable-next-line @next/next/no-img-element */
              <img className={styles.map} src={guide.map} alt={`${mapLabel}: ${dungeon.name}`} />}
          </a>}
        </MaterialPlaque>
        {!!guide.route?.length && <MaterialPlaque kit="den-of-nalorakk" className={styles.routePanel}>
          <h3 className={materialStyles.title}>{c.route}</h3>
          <DungeonRoute steps={guide.route} bosses={guide.bosses.map(boss => boss.name)} lang={lang} />
        </MaterialPlaque>}
      </AtlasSection>
      <AtlasSection title={t.encounters}>
        <DungeonEncounters bosses={guide.bosses} lang={lang} />
      </AtlasSection>
    </div>
    {!!guide.trash?.length && <AtlasSection title={t.trash}><AtlasGrid min={260} fit>{guide.trash.map(enemy => <MaterialPlaque key={enemy.name} kit="den-of-nalorakk" as="article">{/* eslint-disable-next-line @next/next/no-img-element */}
      {enemy.portrait && <img className={styles.portrait} src={enemy.portrait} width={64} height={64} alt="" loading="lazy" />}<h3 className={materialStyles.title}>{enemy.name}</h3><p className={styles.ability}>{enemy.ability}</p><p className={materialStyles.text}>{enemy.response[lang]}</p></MaterialPlaque>)}</AtlasGrid></AtlasSection>}
    <InstanceLoot slug={slug} lang={lang} />
    <AtlasDisclosure summary={t.sources}>{guide.sources.map(([label, href]) => <a key={href} href={href} target="_blank" rel="noreferrer">{label} ↗</a>)}</AtlasDisclosure>
  </ForeverFrame>;
}
