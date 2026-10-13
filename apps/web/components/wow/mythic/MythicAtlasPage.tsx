import { AtlasChart, AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { DungeonCardGrid } from "./DungeonCardGrid";
import { dungeonRoutes, dungeonSlugs } from "./dungeonRoutes";
import { mythicAtlasCopy } from "./mythicAtlasCopy";
import { trail } from "@/lib/routes/registry";

export function MythicAtlasPage({ locale }: { locale: "ru" | "en" }) {
  const copy = mythicAtlasCopy[locale];
  const bossTotal = dungeonSlugs.reduce((sum, slug) => sum + dungeonRoutes[slug].stops.filter((stop) => stop.kind === "boss").length, 0);

  return (
    <AtlasFrame lang={locale} scene="mythicPlus">
      <AtlasHero
        align="center"
        breadcrumbs={trail(locale, "mythicPlus")}
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

      <AtlasSection id="timers" title={copy.timersTitle} description={copy.timersText}>
        <AtlasChart
          label={copy.timersTitle}
          data={[...dungeonSlugs].sort((a, b) => dungeonRoutes[a].timerSeconds - dungeonRoutes[b].timerSeconds).map((slug) => {
            const dungeon = dungeonRoutes[slug];
            return { key: slug, label: locale === "ru" ? dungeon.nameRu : dungeon.name, value: dungeon.timerSeconds, display: `${Math.floor(dungeon.timerSeconds / 60)}:${String(dungeon.timerSeconds % 60).padStart(2, "0")}`, href: `${locale === "ru" ? "/ru" : ""}/wow/mythic-plus/midnight-season-2/${slug}` };
          })}
        />
      </AtlasSection>
    </AtlasFrame>
  );
}
