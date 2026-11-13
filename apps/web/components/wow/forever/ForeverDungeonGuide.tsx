import { notFound } from "next/navigation";
import { AtlasAnchorNav, AtlasSection } from "@/components/atlas";
import type { Lang } from "@/lib/i18n-paths";
import { ForeverFrame } from "./ForeverFrame";
import { ForeverPanel } from "./shared";
import { instanceArt } from "./instanceArt";
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
  const painting = instanceArt(slug);
  return <ForeverFrame lang={lang} page="dungeons" art={painting?.src} artPosition={painting?.position}>
    <InstanceHeading lang={lang} dungeon={dungeon} lede={fresh ? guide.entrance[lang] : undefined} players={fresh ? 5 : undefined} />
    <AtlasAnchorNav label={c.sections} items={[
      { href: "#map", label: c.map },
      ...(guide.route?.length ? [{ href: "#route", label: c.route }] : []),
      { href: "#bosses", label: t.encounters },
      ...(guide.trash?.length ? [{ href: "#enemies", label: c.enemies }] : []),
      ...(hasInstanceLoot(slug) ? [{ href: "#loot", label: c.loot }] : []),
    ]} />
    {!!guide.preparation?.length && <ForeverPanel as="section" className={styles.preparation} title={c.preparation} headingLevel={2}>
      <ul>{guide.preparation.map(note => <li key={note.en}>{note[lang]}</li>)}</ul>
    </ForeverPanel>}
    <AtlasSection id="map" title={c.map}>
      <div className={styles.workspace} data-route={guide.route?.length ? "" : undefined}>
        <ForeverPanel className={styles.mapPanel}>
          <InstanceMaps maps={guide.maps} src={guide.map} viewBox={guide.viewBox}
            name={dungeon.name} lang={lang} bosses={guide.bosses.map(boss => boss.name)} />
        </ForeverPanel>
        {!!guide.route?.length && <ForeverPanel as="section" id="route" className={styles.routePanel} title={c.route} aria-label={c.route}>
          <DungeonRoute steps={guide.route} bosses={bosses} lang={lang} />
        </ForeverPanel>}
      </div>
    </AtlasSection>
    <AtlasSection id="bosses" title={t.encounters}>
      <ForeverPanel><DungeonEncounters bosses={guide.bosses} lang={lang} /></ForeverPanel>
    </AtlasSection>
    {!!guide.trash?.length && <AtlasSection id="enemies" title={t.trash}><InstanceEnemies enemies={guide.trash} lang={lang} /></AtlasSection>}
    <InstanceLoot slug={slug} lang={lang} />
  </ForeverFrame>;
}
