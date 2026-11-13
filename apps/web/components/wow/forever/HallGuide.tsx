import { AtlasAnchorNav, AtlasSection } from "@/components/atlas";
import { MaterialPlaque, materialStyles } from "@/components/wow/shared/materialAtlas";
import type { Lang } from "@/lib/i18n-paths";
import { dungeonGuideCopy } from "./dungeonGuideCopy";
import { FOREVER_KIT } from "./foreverKit";
import { ForeverInstanceFrame } from "./ForeverInstanceFrame";
import { HallGuideClient } from "./HallGuideClient";
import { hallGuideCopy } from "./hallGuideCopy";
import { hallTrash } from "./hallOfThanes";
import { newDungeons } from "./instanceData";
import { InstanceEnemies } from "./InstanceEnemies";
import { InstanceHeading } from "./InstanceHeading";
import { InstanceLoot, hasInstanceLoot } from "./InstanceLoot";
import styles from "./dungeonGuide.module.css";

const hall = newDungeons.find(dungeon => dungeon.slug === "hall-of-thanes")!;

/** Hall of Thanes: its own guide — encounter areas on the map with the fight beside it. */
export function HallGuide({ lang }: { lang: Lang }) {
  const t = hallGuideCopy[lang];
  const c = dungeonGuideCopy[lang];
  return <ForeverInstanceFrame lang={lang} art="hall-of-thanes">
    <InstanceHeading lang={lang} dungeon={hall} lede={t.entrance} players={5} />
    <AtlasAnchorNav label={c.sections} items={[
      { href: "#map", label: c.map },
      { href: "#enemies", label: c.enemies },
      ...(hasInstanceLoot("hall-of-thanes") ? [{ href: "#loot", label: c.loot }] : []),
    ]} />
    <AtlasSection id="map" title={t.map}><HallGuideClient lang={lang} /></AtlasSection>
    <AtlasSection id="enemies" title={t.trash}>
      <InstanceEnemies enemies={hallTrash} lang={lang} />
      <MaterialPlaque kit={FOREVER_KIT} as="section" aria-labelledby="hall-pack" className={styles.afterEnemies}>
        <h3 id="hall-pack" className={materialStyles.title}>{t.before}</h3>
        <p className={materialStyles.text}><strong>{t.pack}</strong></p>
        <p className={materialStyles.text}>{t.packText}</p>
      </MaterialPlaque>
    </AtlasSection>
    <InstanceLoot slug="hall-of-thanes" lang={lang} />
  </ForeverInstanceFrame>;
}
