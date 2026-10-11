import { Clock3, Database, MapPin, Route, Skull } from "lucide-react";
import { AtlasCard, AtlasGrid } from "@/components/atlas";
import { dungeonRoutes, dungeonSlugs } from "./dungeonRoutes";
import { dungeonLocationEn, mythicAtlasCopy } from "./mythicAtlasCopy";
import styles from "./mythicAtlasPage.module.css";

function formatTimer(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Illustrated cards of the season's dungeons; `hrefBase` is the route prefix without /ru (e.g. "/wow/dungeons"). */
export function DungeonCardGrid({ locale, hrefBase, priority = true }: { locale: "ru" | "en"; hrefBase: string; priority?: boolean }) {
  const copy = mythicAtlasCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  return (
    <AtlasGrid min={290} fit>
      {dungeonSlugs.map((slug, index) => {
        const dungeon = dungeonRoutes[slug];
        const bosses = dungeon.stops.filter((stop) => stop.kind === "boss");
        const abilityCount = new Set(dungeon.stops.flatMap((stop) => stop.abilities.map((ability) => ability.name))).size;
        const location = locale === "ru" ? dungeon.location : dungeonLocationEn[dungeon.location];
        return (
          <AtlasCard
            key={slug}
            href={`${prefix}${hrefBase}/${slug}`}
            image={{ src: dungeon.backdropImage, alt: "", priority: priority && index < 2 }}
            accent={dungeon.accent}
            index={String(index + 1).padStart(2, "0")}
            artCaption={<><Clock3 aria-hidden="true" /><span className={styles.srOnly}>{copy.timer}: </span>{formatTimer(dungeon.timerSeconds)}</>}
            eyebrow={location ? <><MapPin aria-hidden="true" />{location}</> : "Mythic+"}
            title={locale === "ru" ? dungeon.nameRu : dungeon.name}
            subtitle={locale === "ru" ? dungeon.name : undefined}
            description={locale === "ru" ? dungeon.description : undefined}
            meta={[
              { icon: <Route aria-hidden="true" />, label: copy.stops(dungeon.stops.length) },
              { icon: <Skull aria-hidden="true" />, label: copy.bossCount(bosses.length) },
              { icon: <Database aria-hidden="true" />, label: copy.abilities(abilityCount) },
            ]}
            cta={copy.open}
          >
            <ol className={styles.bosses}>
              {bosses.map((boss) => <li key={boss.id}>{boss.title}</li>)}
            </ol>
          </AtlasCard>
        );
      })}
    </AtlasGrid>
  );
}
