import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { DungeonCardGrid } from "./DungeonCardGrid";
import { dungeonRoutes, dungeonSlugs } from "./dungeonRoutes";
import { mythicAtlasCopy } from "./mythicAtlasCopy";

export function MythicAtlasPage({ locale }: { locale: "ru" | "en" }) {
  const copy = mythicAtlasCopy[locale];
  const bossTotal = dungeonSlugs.reduce((sum, slug) => sum + dungeonRoutes[slug].stops.filter((stop) => stop.kind === "boss").length, 0);

  return (
    <AtlasFrame lang={locale} art="/assets/wow/mythic/ruby-depth-v3-light-fast.webp" artPosition="center 30%" tint="rgba(200, 93, 38, .18)">
      <AtlasHero
        align="center"
        breadcrumbs={[{ label: "World of Warcraft", href: `${locale === "ru" ? "/ru" : ""}/wow` }, { label: "Mythic+" }]}
        breadcrumbsLabel={copy.breadcrumbsLabel}
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

      <AtlasSection id="dungeons" title={copy.listTitle}>
        <DungeonCardGrid locale={locale} hrefBase="/wow/mythic-plus/midnight-season-2" />
      </AtlasSection>
    </AtlasFrame>
  );
}
