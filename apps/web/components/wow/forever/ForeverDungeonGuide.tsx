import { notFound } from "next/navigation";
import { AtlasAnchorNav, AtlasSection } from "@/components/atlas";
import { MaterialPlaque, materialStyles } from "@/components/wow/shared/materialAtlas";
import type { Lang } from "@/lib/i18n-paths";
import { FOREVER_KIT } from "./foreverKit";
import { ForeverInstanceFrame } from "./ForeverInstanceFrame";
import { dungeonGuideCopy } from "./dungeonGuideCopy";
import { dungeonGuides } from "./dungeonGuides";
import { newDungeons, returningDungeonDetails } from "./instanceData";
import { InstanceLoot, hasInstanceLoot } from "./InstanceLoot";
import { DungeonEncounters } from "./DungeonEncounters";
import { bossName } from "./encounterNames";
import { DungeonRoute } from "./DungeonRoute";
import { InstanceEnemies } from "./InstanceEnemies";
import { InstanceHeading } from "./InstanceHeading";
import { InstanceMaps } from "./InstanceMaps";
import { hallGuideCopy } from "./hallGuideCopy";
import styles from "./dungeonGuide.module.css";

export function ForeverDungeonGuide({ lang, slug }: { lang: Lang; slug: string }) {
  const guide = dungeonGuides[slug];
  const dungeon = [...newDungeons, ...returningDungeonDetails].find(item => item.slug === slug);
  if (!guide || !dungeon) notFound();
  const t = hallGuideCopy[lang];
  const c = dungeonGuideCopy[lang];
  const fresh = newDungeons.some(item => item.slug === slug);
  const bosses = guide.bosses.map(boss => ({ name: boss.name, label: bossName(boss, lang), portrait: boss.portrait }));
  return <ForeverInstanceFrame lang={lang} art={slug}>
    <InstanceHeading lang={lang} dungeon={dungeon} lede={fresh ? guide.entrance[lang] : undefined} players={fresh ? 5 : undefined} />
    <AtlasAnchorNav label={c.sections} items={[
      { href: "#map", label: c.map },
      ...(guide.route?.length ? [{ href: "#route", label: c.route }] : []),
      { href: "#bosses", label: t.encounters },
      ...(guide.trash?.length ? [{ href: "#enemies", label: c.enemies }] : []),
      ...(hasInstanceLoot(slug) ? [{ href: "#loot", label: c.loot }] : []),
    ]} />
    {!!guide.preparation?.length && <MaterialPlaque kit={FOREVER_KIT} as="section" className={styles.preparation} aria-labelledby="preparation-title">
      <h2 id="preparation-title" className={materialStyles.title}>{c.preparation}</h2>
      <ul>{guide.preparation.map(note => <li key={note.en}>{note[lang]}</li>)}</ul>
    </MaterialPlaque>}
    <AtlasSection id="map" title={c.map}>
      <div className={styles.workspace} data-route={guide.route?.length ? "" : undefined}>
        <MaterialPlaque kit={FOREVER_KIT} className={styles.mapPanel}>
          <InstanceMaps maps={guide.maps} src={guide.map} viewBox={guide.viewBox}
            name={dungeon.name} lang={lang} bosses={guide.bosses.map(boss => boss.name)} />
        </MaterialPlaque>
        {!!guide.route?.length && <MaterialPlaque kit={FOREVER_KIT} as="section" id="route" className={styles.routePanel} aria-labelledby="route-title">
          <h3 id="route-title" className={materialStyles.title}>{c.route}</h3>
          <DungeonRoute steps={guide.route} bosses={bosses} lang={lang} />
        </MaterialPlaque>}
      </div>
    </AtlasSection>
    <AtlasSection id="bosses" title={t.encounters}>
      <MaterialPlaque kit={FOREVER_KIT}><DungeonEncounters bosses={guide.bosses} lang={lang} /></MaterialPlaque>
    </AtlasSection>
    {!!guide.trash?.length && <AtlasSection id="enemies" title={t.trash}><InstanceEnemies enemies={guide.trash} lang={lang} /></AtlasSection>}
    <InstanceLoot slug={slug} lang={lang} />
  </ForeverInstanceFrame>;
}
