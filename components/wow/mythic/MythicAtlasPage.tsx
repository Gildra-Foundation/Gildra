import { Gem, Info } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { DungeonCardGrid } from "./DungeonCardGrid";
import { dungeonRoutes, dungeonSlugs } from "./dungeonRoutes";
import { mythicAtlasCopy } from "./mythicAtlasCopy";
import styles from "./mythicAtlasPage.module.css";

export function MythicAtlasPage({ locale }: { locale: "ru" | "en" }) {
  const copy = mythicAtlasCopy[locale];
  const bossTotal = dungeonSlugs.reduce((sum, slug) => sum + dungeonRoutes[slug].stops.filter((stop) => stop.kind === "boss").length, 0);

  return (
    <AtlasFrame lang={locale} art="/assets/wow/mythic/ruby-depth-v3-light-fast.webp" artPosition="center 30%" tint="rgba(200, 93, 38, .18)">
      <AtlasHero
        emblem={<Gem />}
        emblemShape="diamond"
        eyebrow={copy.eyebrow}
        title={copy.title}
        lede={copy.lede}
        statsLabel={copy.statsLabel}
        stats={[
          { value: dungeonSlugs.length, label: copy.dungeons },
          { value: bossTotal, label: copy.bosses },
          { value: "S2", label: copy.season },
        ]}
      />

      <AtlasSection id="dungeons" title={copy.listTitle} description={copy.listText}>
        <DungeonCardGrid locale={locale} hrefBase="/wow/mythic-plus/midnight-season-2" />
        <p className={styles.note}><Info aria-hidden="true" />{copy.progressNote}</p>
      </AtlasSection>
    </AtlasFrame>
  );
}
