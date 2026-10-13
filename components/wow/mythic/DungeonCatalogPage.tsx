import { ExternalLink } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasLinkButton, AtlasSection } from "@/components/atlas";
import { DungeonCardGrid } from "./DungeonCardGrid";
import { dungeonSlugs } from "./dungeonRoutes";
import { trail } from "@/lib/routes/registry";

const copy = {
  ru: { breadcrumbs: "Навигация", wow: "World of Warcraft", eyebrow: "Midnight · Сезон 2", title: "Подземелья", lede: "Подземелья текущего сезона: маршрут, боссы, таймер и тактика для каждого.", dungeons: "подземелий", list: "Подземелья сезона", source: "Анонс Blizzard" },
  en: { breadcrumbs: "Breadcrumbs", wow: "World of Warcraft", eyebrow: "Midnight · Season 2", title: "Dungeons", lede: "Dungeons of the current season: route, bosses, timer and strategy for each.", dungeons: "dungeons", list: "Dungeons of the season", source: "Blizzard announcement" },
} as const;

export function DungeonCatalogPage({ locale }: { locale: "en" | "ru" }) {
  const text = copy[locale];
  return (
    <AtlasFrame lang={locale} scene="dungeons">
      <AtlasHero
        breadcrumbs={trail(locale, "dungeons")}
        breadcrumbsLabel={text.breadcrumbs}
        eyebrow={text.eyebrow}
        title={text.title}
        lede={text.lede}
        stats={[{ value: dungeonSlugs.length, label: text.dungeons }]}
      />
      <AtlasSection id="dungeons" title={text.list} aside={<AtlasLinkButton variant="ghost" size="sm" href="https://worldofwarcraft.blizzard.com/en-us/news/24280285" external iconAfter={<ExternalLink aria-hidden="true" />}>{text.source}</AtlasLinkButton>}>
        <DungeonCardGrid locale={locale} hrefBase="/wow/dungeons" />
      </AtlasSection>
    </AtlasFrame>
  );
}
