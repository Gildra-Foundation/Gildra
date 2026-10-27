import { wowSourceName } from "@/lib/wow/sourceLocale";
import { Clock3, Skull } from "lucide-react";
import { AtlasGrid } from "@/components/atlas";
import { dungeonRoutes, dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import { dungeonBackdropSmall } from "@/lib/wow/dungeonArtDirection";
import { mythicHubThemes, mythicHubMaterialCopy } from "./hub/mythicHubThemes";
import { PaintedCard } from "./PaintedCard";
import { dungeonLocationEn, mythicAtlasCopy } from "./mythicAtlasCopy";
import { formatHubTimer } from "./mythicHubTimers";
import cardStyles from "./dungeonCardGrid.module.css";

/** Painted cards of the season's dungeons (picture + plaque); `hrefBase` is the route prefix without /ru. */
export function DungeonCardGrid({ locale, hrefBase, priority = true }: { locale: "ru" | "en"; hrefBase: string; priority?: boolean }) {
  const copy = mythicAtlasCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  return (
    <AtlasGrid min={290} fit className={cardStyles.hubGrid}>
      {dungeonSlugs.map((slug, index) => {
        const dungeon = dungeonRoutes[slug];
        const bosses = dungeon.stops.filter((stop) => stop.kind === "boss");
        const name = wowSourceName(dungeon.name, locale, dungeon.nameRu);
        return <PaintedCard
          key={slug}
          kit={slug}
          id={`mythic-hub-${slug}`}
          href={`${prefix}${hrefBase}/${slug}`}
          scene={dungeonBackdropSmall(slug)}
          priority={priority && index < 2}
          location={locale === "ru" ? dungeon.location : dungeonLocationEn[dungeon.location]}
          title={name}
          facts={<>
            <span className={cardStyles.timer} data-hub-card-timer>
              <Clock3 aria-hidden="true" /><span className={cardStyles.srOnly}>{copy.timer}: </span>
              <time dateTime={`PT${dungeon.timerSeconds}S`}>{formatHubTimer(dungeon.timerSeconds)}</time>
            </span>
            <span><Skull aria-hidden="true" />{copy.bossCount(bosses.length)}</span>
          </>}
          description={mythicHubThemes[slug].description[locale]}
          action={copy.open}
          actionLabel={name}
          source={{ href: dungeon.guideUrl, label: mythicHubMaterialCopy[locale].source }}
          cardData={{ "data-hub-dungeon-card": slug }}
        />;
      })}
    </AtlasGrid>
  );
}
