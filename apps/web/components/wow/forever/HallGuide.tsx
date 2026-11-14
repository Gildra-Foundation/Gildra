import { AtlasAnchorNav, AtlasSection } from "@/components/atlas";
import type { Lang } from "@/lib/i18n-paths";
import { dungeonGuideCopy } from "./dungeonGuideCopy";
import { ForeverFrame } from "./ForeverFrame";
import { ForeverPanel, ForeverStack, foreverPanelStyles } from "./shared";
import { instanceArt } from "./instanceArt";
import { HallGuideClient } from "./HallGuideClient";
import { hallGuideCopy } from "./hallGuideCopy";
import { hallTrash } from "./hallOfThanes";
import { newDungeons } from "./instanceData";
import { InstanceEnemies } from "./InstanceEnemies";
import { InstanceHeading } from "./InstanceHeading";
import { InstanceLoot, hasInstanceLoot } from "./InstanceLoot";

const hall = newDungeons.find(dungeon => dungeon.slug === "hall-of-thanes")!;

/** Hall of Thanes: its own guide — encounter areas on the map with the fight beside it. */
export function HallGuide({ lang }: { lang: Lang }) {
  const t = hallGuideCopy[lang];
  const c = dungeonGuideCopy[lang];
  const painting = instanceArt(hall.slug);
  return <ForeverFrame lang={lang} page="dungeons" art={painting?.src} artPosition={painting?.position}>
    <InstanceHeading lang={lang} dungeon={hall} lede={t.entrance} players={5} />
    <AtlasAnchorNav label={c.sections} items={[
      { href: "#map", label: c.map },
      { href: "#enemies", label: c.enemies },
      ...(hasInstanceLoot("hall-of-thanes") ? [{ href: "#loot", label: c.loot }] : []),
    ]} />
    <AtlasSection id="map" title={t.map}><HallGuideClient lang={lang} /></AtlasSection>
    <AtlasSection id="enemies" title={t.trash}>
      <ForeverStack>
        <InstanceEnemies enemies={hallTrash} lang={lang} />
        <ForeverPanel as="section" title={t.before} aria-label={t.before}>
          <p className={foreverPanelStyles.text}><strong>{t.pack}</strong></p>
          <p className={foreverPanelStyles.text}>{t.packText}</p>
        </ForeverPanel>
      </ForeverStack>
    </AtlasSection>
    <InstanceLoot slug="hall-of-thanes" lang={lang} />
  </ForeverFrame>;
}
