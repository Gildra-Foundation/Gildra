import { FOREVER_KIT } from "./foreverKit";
import { notFound } from "next/navigation";
import { AtlasGrid, AtlasHero, AtlasMetaList, AtlasSection } from "@/components/atlas";
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
import { instanceName } from "./instanceLocalization";
import { EncounterNavigation } from "./DungeonEncounters";
import ux from "./foreverUx.module.css";
import styles from "./dungeonGuide.module.css";

export function ForeverDungeonGuide({ lang, slug }: { lang: Lang; slug: string }) {
  const guide = dungeonGuides[slug];
  const dungeon = [...newDungeons, ...returningDungeonDetails].find(item => item.slug === slug);
  if (!guide || !dungeon) notFound();
  const t = hallGuideCopy[lang];
  const c = dungeonGuideCopy[lang];
  const name = instanceName(dungeon.name, lang);
  const mapLabel = c.map;
  return <ForeverFrame lang={lang}>
    <AtlasHero title={name} align="start" lede={guide.entrance[lang]} breadcrumbsLabel={t.breadcrumb} breadcrumbs={[{ label: "WoW — Forever", href: p(lang, "/wow/forever") }, { label: t.dungeons, href: p(lang, "/wow/forever/dungeons") }, { label: name }]} />
    {name !== dungeon.name && <p className={ux.alias} lang="en">{dungeon.name}</p>}
    <AtlasMetaList items={[{ label: t.level, value: `${dungeon.min}–${dungeon.max}` }, ...(newDungeons.some(item => item.slug === slug) ? [{ label: t.players, value: 5 }] : [])]} />
    <EncounterNavigation bosses={guide.bosses} lang={lang} />
    {!!guide.preparation?.length && <section className={ux.preparation} aria-label={c.preparation}><h2>{c.preparation}</h2>{guide.preparation.map(note => <p key={note.en}>{note[lang]}</p>)}</section>}
    <div className={styles.workspace}>
      <AtlasSection title={mapLabel}>
        <MaterialPlaque kit={FOREVER_KIT}>
          <InstanceMaps maps={guide.maps} src={guide.map} viewBox={guide.viewBox}
            name={name} lang={lang} bosses={guide.bosses.map(boss => boss.name)} />
        </MaterialPlaque>
        {!!guide.route?.length && <MaterialPlaque kit={FOREVER_KIT} className={styles.routePanel}>
          <h3 className={materialStyles.title}>{c.route}</h3>
          <DungeonRoute steps={guide.route} bosses={guide.bosses.map(boss => boss.name)} lang={lang} />
        </MaterialPlaque>}
      </AtlasSection>
      <AtlasSection title={t.encounters}>
        <DungeonEncounters bosses={guide.bosses} lang={lang} />
      </AtlasSection>
    </div>
    {!!guide.trash?.length && <AtlasSection title={t.trash}><AtlasGrid min={260} fit>{guide.trash.map(enemy => <MaterialPlaque key={enemy.name} kit={FOREVER_KIT} as="article">{/* eslint-disable-next-line @next/next/no-img-element */}
      {enemy.portrait && <img className={styles.portrait} src={enemy.portrait} width={64} height={64} alt="" loading="lazy" />}<h3 className={materialStyles.title}>{enemy.name}</h3><p className={styles.ability}>{enemy.ability}</p><p className={materialStyles.text}>{enemy.response[lang]}</p></MaterialPlaque>)}</AtlasGrid></AtlasSection>}
    <InstanceLoot slug={slug} lang={lang} />
  </ForeverFrame>;
}
