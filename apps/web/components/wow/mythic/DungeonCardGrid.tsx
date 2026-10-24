import { canBrowsePublication, isPublicationReady } from "@/lib/wow/publication";
import { wowSourceName } from "@/lib/wow/sourceLocale";
import { Clock3, MapPin, Route, Skull } from "lucide-react";
import { AtlasBadge, AtlasCard, AtlasGrid } from "@/components/atlas";
import { mvpRoute } from "./mvpRoute";
import { dungeonRoutes, dungeonSlugs } from "./dungeonRoutes";
import { dungeonLocationEn, mythicAtlasCopy } from "./mythicAtlasCopy";
import styles from "./mythicAtlasPage.module.css";

function formatTimer(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Published dungeon guides with their verified key timers. */
export function DungeonCardGrid({ locale, hrefBase, priority = true }: { locale: "ru" | "en"; hrefBase: string; priority?: boolean }) {
  const copy = mythicAtlasCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  return (
    <AtlasGrid min={290} fit>
      {dungeonSlugs.filter(slug => canBrowsePublication(`/wow/mythic-plus/midnight-season-2/${slug}`)).map((slug, index) => {
        const dungeon = mvpRoute(dungeonRoutes[slug], locale);
        const bosses = dungeon.stops.filter((stop) => stop.kind === "boss");
        const location = locale === "ru" ? dungeonRoutes[slug].location : dungeonLocationEn[dungeonRoutes[slug].location] ?? dungeon.location;
        return (
          <AtlasCard
            key={slug}
            href={`${prefix}${hrefBase}/${slug}`}
            image={{ src: dungeon.backdropImage, alt: "", priority: priority && index < 2 }}
            accent={dungeon.accent}
            artBadge={isPublicationReady(`/wow/mythic-plus/midnight-season-2/${slug}`) ? undefined : <AtlasBadge tone="caution">{copy.draft}</AtlasBadge>}
            artCaption={<><Clock3 aria-hidden="true" /><span className={styles.srOnly}>{copy.timer}: </span>{formatTimer(dungeon.timerSeconds)}</>}
            eyebrow={location ? <><MapPin aria-hidden="true" />{location}</> : "Mythic+"}
            title={wowSourceName(dungeon.name, locale, dungeon.nameRu)}
            meta={[
              { icon: <Skull aria-hidden="true" />, label: copy.bossCount(bosses.length) },
              { icon: <Route aria-hidden="true" />, label: copy.stops(dungeon.stops.length) },
            ]}
            cta={copy.open}
          />
        );
      })}
    </AtlasGrid>
  );
}
