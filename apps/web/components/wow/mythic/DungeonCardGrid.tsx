import type { CSSProperties } from "react";
import Image from "next/image";
import { routeSummary } from "@/lib/data/wow/mythicReviewSummary";
import { wowSourceName } from "@/lib/wow/sourceLocale";
import { ArrowUpRight, Clock3, MapPin, Route, Skull } from "lucide-react";
import { AtlasBadge, AtlasCard, AtlasGrid } from "@/components/atlas";
import { AtlasArticleCard } from "@gildra/atlas-ui/AtlasArticleCard";
import { dungeonRoutes, dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import { dungeonArtDirections, dungeonBackdropSmall, dungeonFrameArtwork } from "@/lib/wow/dungeonArtDirection";
import { dungeonMapFrameLayout } from "./dungeonMapFrameLayout";
import { dungeonLocationEn, mythicAtlasCopy } from "./mythicAtlasCopy";
import { formatHubTimer } from "./mythicHubTimers";
import cardStyles from "./dungeonCardGrid.module.css";
import styles from "./mythicAtlasPage.module.css";

/** Illustrated cards of the season's dungeons; `hrefBase` is the route prefix without /ru (e.g. "/wow/dungeons").
 *  Routes show pinned MDT imports when their clone IDs match the dataset. */
export function DungeonCardGrid({ locale, hrefBase, priority = true, variant = "default" }: { locale: "ru" | "en"; hrefBase: string; priority?: boolean; variant?: "default" | "hub" }) {
  const copy = mythicAtlasCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  return (
    <AtlasGrid min={variant === "hub" ? 320 : 290} fit className={variant === "hub" ? cardStyles.hubGrid : undefined}>
      {dungeonSlugs.map((slug, index) => {
        const dungeon = dungeonRoutes[slug];
        const bosses = dungeon.stops.filter((stop) => stop.kind === "boss");
        const location = locale === "ru" ? dungeon.location : dungeonLocationEn[dungeon.location];
        const href = `${prefix}${hrefBase}/${slug}`;
        if (variant === "hub") {
          const direction = dungeonArtDirections[slug];
          const pulls = routeSummary[slug].pulls;
          return <AtlasArticleCard
            key={slug}
            locale={locale}
            href={href}
            className={cardStyles.hubCard}
            data-hub-dungeon-card={slug}
            style={{ ...dungeonMapFrameLayout(slug), "--hub-card-accent": direction.accent } as CSSProperties}
            image={<div className={cardStyles.frameCanvas}>
              <div className={cardStyles.artWindow} data-hub-card-art>
                <Image
                  src={dungeonBackdropSmall(slug)}
                  alt=""
                  fill
                  sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 25vw"
                  priority={priority && index < 2}
                  className={cardStyles.sceneImage}
                />
                <span className={cardStyles.artShade} aria-hidden="true" />
                <span className={cardStyles.timer} data-hub-card-timer>
                  <Clock3 aria-hidden="true" />
                  <span className={cardStyles.srOnly}>{copy.timer}: </span>
                  <time dateTime={`PT${dungeon.timerSeconds}S`}>{formatHubTimer(dungeon.timerSeconds)}</time>
                </span>
              </div>
              <Image
                src={dungeonFrameArtwork(slug)}
                alt=""
                fill
                sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 25vw"
                className={cardStyles.frameImage}
                aria-hidden="true"
              />
            </div>}
            kicker={location ? <span className={cardStyles.location}><MapPin aria-hidden="true" />{location}</span> : "Mythic+"}
            title={wowSourceName(dungeon.name, locale, dungeon.nameRu)}
            excerpt={<>
              <span className={cardStyles.facts}>
                <span><Skull aria-hidden="true" />{copy.bossCount(bosses.length)}</span>
                {routeSummary[slug].status === "dataset-matched" ? <span><Route aria-hidden="true" />{copy.stops(pulls)}</span> : null}
              </span>
              <span className={cardStyles.openRoute}>{copy.open}<ArrowUpRight aria-hidden="true" /></span>
            </>}
          />;
        }
        return (
          <AtlasCard
            key={slug}
            href={href}
            image={{ src: dungeon.backdropImage, alt: "", priority: priority && index < 2 }}
            accent={dungeon.accent}
            artBadge={<AtlasBadge tone="caution">{routeSummary[slug].status === "dataset-matched" ? copy.mdtChecked : copy.draft}</AtlasBadge>}
            artCaption={<><Clock3 aria-hidden="true" /><span className={styles.srOnly}>{copy.timer}: </span>{formatHubTimer(dungeon.timerSeconds)}</>}
            eyebrow={location ? <><MapPin aria-hidden="true" />{location}</> : "Mythic+"}
            title={wowSourceName(dungeon.name, locale, dungeon.nameRu)}
            meta={[
              { icon: <Skull aria-hidden="true" />, label: copy.bossCount(bosses.length) },
              { icon: <Route aria-hidden="true" />, label: routeSummary[slug].status === "dataset-matched" ? copy.stops(routeSummary[slug].pulls) : copy.importUpdate },
            ]}
            cta={copy.open}
          />
        );
      })}
    </AtlasGrid>
  );
}
