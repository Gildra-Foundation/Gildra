import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { routeSummary } from "@/lib/data/wow/mythicReviewSummary";
import { wowSourceName } from "@/lib/wow/sourceLocale";
import { ArrowUpRight, Clock3, MapPin, Route, Skull } from "lucide-react";
import { AtlasBadge, AtlasCard, AtlasGrid } from "@/components/atlas";
import { Card } from "@gildra/atlas-ui/valyro-ui/data-display/Card";
import { MythicHubLinkButton as AtlasLinkButton } from "./hub/MythicHubLinkButton";
import bridge from "@gildra/atlas-ui/valyroAtlasBridge.module.css";
import { dungeonRoutes, dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import { dungeonBackdropSmall, dungeonFrameArtwork } from "@/lib/wow/dungeonArtDirection";
import { mythicHubThemes, mythicHubMaterialCopy, mythicHubFrameLayout } from "./hub/mythicHubThemes";
import { mythicHubControlLayout } from "./hub/mythicHubControls";
import { MythicHubOrnaments } from "./hub/MythicHubOrnaments";
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
    <AtlasGrid min={290} fit className={variant === "hub" ? cardStyles.hubGrid : undefined}>
      {dungeonSlugs.map((slug, index) => {
        const dungeon = dungeonRoutes[slug];
        const bosses = dungeon.stops.filter((stop) => stop.kind === "boss");
        const location = locale === "ru" ? dungeon.location : dungeonLocationEn[dungeon.location];
        const href = `${prefix}${hrefBase}/${slug}`;
        if (variant === "hub") {
          const theme = mythicHubThemes[slug];
          const materialCopy = mythicHubMaterialCopy[locale];
          const matched = routeSummary[slug].status === "dataset-matched";
          const name = wowSourceName(dungeon.name, locale, dungeon.nameRu);
          const sizes = "(max-width: 900px) 100vw, 50vw";
          return <Card
            key={slug}
            padding="none"
            variant="outline"
            className={`${bridge.scope} ${cardStyles.hubCard}`}
            data-hub-dungeon-card={slug}
            data-mythic-card-theme={theme.motif}
            style={{ ...mythicHubFrameLayout(slug), ...mythicHubControlLayout(slug) } as CSSProperties}
          >
            <article className={cardStyles.content} aria-labelledby={`mythic-hub-${slug}`}>
              <Link className={cardStyles.artLink} href={href} tabIndex={-1} aria-hidden="true">
                <div className={cardStyles.frameCanvas}>
                  <div className={cardStyles.artWindow} data-hub-card-art>
                    <div className={cardStyles.sceneLayer} data-hub-dungeon-scene>
                      <Image
                        src={dungeonBackdropSmall(slug)}
                        alt=""
                        fill
                        sizes={sizes}
                        priority={priority && index < 2}
                        className={cardStyles.sceneImage}
                        data-hub-dungeon-image
                      />
                    </div>
                    <span className={cardStyles.artShade} aria-hidden="true" />
                  </div>
                  <Image src={dungeonFrameArtwork(slug)} alt="" fill sizes={sizes} className={cardStyles.frameImage} aria-hidden="true" />
                </div>
              </Link>
              <div className={cardStyles.body} data-mythic-material-panel={slug}>
                {location ? <p className={cardStyles.location}><MapPin aria-hidden="true" />{location}</p> : null}
                <h3 className={cardStyles.title} id={`mythic-hub-${slug}`}><Link href={href}>{name}</Link></h3>
                <div className={cardStyles.facts}>
                  <span className={cardStyles.timer} data-hub-card-timer>
                    <Clock3 aria-hidden="true" /><span className={cardStyles.srOnly}>{copy.timer}: </span>
                    <time dateTime={`PT${dungeon.timerSeconds}S`}>{formatHubTimer(dungeon.timerSeconds)}</time>
                  </span>
                  <span><Skull aria-hidden="true" />{copy.bossCount(bosses.length)}</span>
                  {matched ? <span><Route aria-hidden="true" />{copy.stops(routeSummary[slug].pulls)}</span> : null}
                </div>
                <p className={cardStyles.description}>{theme.description[locale]}</p>
                <footer className={cardStyles.footer}>
                  <AtlasLinkButton className={cardStyles.openRoute} href={href} prefetch={false}>
                    {copy.open}<span className={cardStyles.srOnly}>: {name}</span>
                  </AtlasLinkButton>
                  <a className={cardStyles.source} href={dungeon.guideUrl} target="_blank" rel="noreferrer">{materialCopy.source}<ArrowUpRight aria-hidden="true" /></a>
                </footer>
                <MythicHubOrnaments slug={slug} />
              </div>
            </article>
          </Card>;
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
