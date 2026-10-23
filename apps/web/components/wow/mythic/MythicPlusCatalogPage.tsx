import { ExternalLink, Hourglass } from "lucide-react";
import { AtlasFrame, AtlasGrid, AtlasHero, AtlasLinkButton, AtlasNotice, AtlasSection, AtlasTile } from "@/components/atlas";
import { DungeonCardGrid } from "./DungeonCardGrid";
import { MythicDataNotice } from "./MythicDataNotice";
import { mythicVerification } from "./mythicVerification";
import { dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import { trail } from "@/lib/routes/registry";

type Season = "midnight-season-1" | "midnight-season-2";

const copy = {
  ru: {
    breadcrumbs: "Навигация", wow: "World of Warcraft", hub: "Атлас Эпохальный+", eyebrow: "Midnight",
    title: (n: string) => `Mythic+ · сезон ${n}`,
    current: "Подземелья текущего сезона ключей с маршрутами, таймерами и тактикой.",
    past: "Архив первого сезона Midnight.",
    pendingTitle: "Состав пула появится позже",
    pending: "Список подземелий первого сезона опубликуем после сверки по источникам.",
    dungeons: "подземелий", list: "Подземелья сезона", seasons: "Сезоны", source: "Анонс Blizzard",
    season1: "Midnight · Сезон 1", season2: "Midnight · Сезон 2", archive: "Архив", currentLabel: "Текущий сезон",
  },
  en: {
    breadcrumbs: "Breadcrumbs", wow: "World of Warcraft", hub: "Mythic+ atlas", eyebrow: "Midnight",
    title: (n: string) => `Mythic+ · Season ${n}`,
    current: "Dungeons of the current keystone season with routes, timers and strategy.",
    past: "Archive of the first Midnight season.",
    pendingTitle: "The dungeon pool will appear later",
    pending: "We will publish the first season's dungeon list once it is checked against the sources.",
    dungeons: "dungeons", list: "Dungeons of the season", seasons: "Seasons", source: "Blizzard announcement",
    season1: "Midnight · Season 1", season2: "Midnight · Season 2", archive: "Archive", currentLabel: "Current season",
  },
} as const;

const sources: Record<Season, string> = {
  "midnight-season-2": mythicVerification.season.source,
  "midnight-season-1": "https://worldofwarcraft.blizzard.com/en-us/news/24266321/midnight-season-1-has-begun",
};

export function MythicPlusCatalogPage({ locale, season = "midnight-season-2" }: { locale: "en" | "ru"; season?: Season }) {
  const text = copy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const isCurrent = season === "midnight-season-2";
  return (
    <AtlasFrame lang={locale} scene="dungeons">
      <AtlasHero
        breadcrumbs={trail(locale, "mythicPlus", { label: text.title(isCurrent ? "2" : "1") })}
        breadcrumbsLabel={text.breadcrumbs}
        eyebrow={text.eyebrow}
        title={text.title(isCurrent ? "2" : "1")}
        lede={isCurrent ? text.current : text.past}
        stats={isCurrent ? [{ value: dungeonSlugs.length, label: text.dungeons }] : undefined}
      />
      {isCurrent ? <MythicDataNotice locale={locale} /> : null}
      <AtlasSection id="dungeons" title={isCurrent ? text.list : undefined} aside={<AtlasLinkButton variant="ghost" size="sm" href={sources[season]} external iconAfter={<ExternalLink aria-hidden="true" />}>{text.source}</AtlasLinkButton>}>
        {isCurrent
          ? <DungeonCardGrid locale={locale} hrefBase={`/wow/mythic-plus/${season}`} />
          : <AtlasNotice tone="caution" icon={<Hourglass />} title={text.pendingTitle}>{text.pending}</AtlasNotice>}
      </AtlasSection>
      <AtlasSection id="seasons" title={text.seasons} level={3}>
        <AtlasGrid min={260} fit>
          <AtlasTile href={`${prefix}/wow/mythic-plus/seasons/midnight-season-2`} title={text.season2} text={text.currentLabel} />
          <AtlasTile href={`${prefix}/wow/mythic-plus/seasons/midnight-season-1`} title={text.season1} text={text.archive} />
        </AtlasGrid>
      </AtlasSection>
    </AtlasFrame>
  );
}
