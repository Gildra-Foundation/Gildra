import type { MythicPayload } from "@/lib/data/gamecontent/types";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { wowSourceName } from "@/lib/wow/sourceLocale";
import { DungeonCardGrid } from "./DungeonCardGrid";
import { MythicDataNotice } from "./MythicDataNotice";
import { dungeonRoutes as baselineRoutes, dungeonSlugs as baselineSlugs, type DungeonRoute } from "./dungeonRoutes";
import { mythicAtlasCopy } from "./mythicAtlasCopy";
import { mythicVerification as baselineVerification } from "./mythicVerification";
import { verificationDate } from "./mythicVerificationCopy";
import { trail } from "@/lib/routes/registry";
import styles from "./mythicAtlasPage.module.css";

export function MythicAtlasPage({ locale, content }: { locale: "ru" | "en"; content?: MythicPayload }) {
  const dungeonRoutes: Record<string, DungeonRoute> = content?.dungeons ?? baselineRoutes;
  const dungeonSlugs = content?.catalog.dungeonOrder ?? baselineSlugs;
  const mythicVerification = content?.verification ?? baselineVerification;
  const seasonSlug = content?.catalog.season.slug ?? "midnight-season-2";
  const matchedRoutes = content ? Object.values(content.combatIntel).filter((entry) => entry.mdt.route.status === "dataset-matched").length : undefined;
  const copy = mythicAtlasCopy[locale];
  const bossTotal = dungeonSlugs.reduce((sum, slug) => sum + (content?.dungeons[slug].bossCount ?? dungeonRoutes[slug].stops.filter((stop) => stop.kind === "boss").length), 0);

  return (
    <AtlasFrame lang={locale} scene="mythicPlus">
      <AtlasHero
        align="center"
        breadcrumbs={trail(locale, "mythicPlus")}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={content?.catalog.season.names[locale] ?? copy.eyebrow}
        title={copy.title}
        lede={copy.lede}
        actions={<a className={styles.compareLink} href="#timers">{copy.compare}</a>}
        statsLabel={copy.statsLabel}
        stats={[
          { value: dungeonSlugs.length, label: copy.dungeons },
          { value: bossTotal, label: copy.bosses },
          { value: content ? `S${content.catalog.season.number}` : "S2", label: copy.season },
        ]}
      />

      <MythicDataNotice locale={locale} verification={mythicVerification} matchedRoutes={matchedRoutes} />

      <AtlasSection id="timers" className={styles.timers} title={copy.timersTitle} description={copy.timersText}>
        <p className={styles.timerProvenance}>
          {copy.timerChecked}: <time dateTime={mythicVerification.timers.checkedAt}>{verificationDate(mythicVerification.timers.checkedAt, locale)}</time>
          {" · "}<a href={mythicVerification.timers.source}>{copy.timerSource}</a>
        </p>
        <table className={styles.timerTable} aria-labelledby="timers-title">
          <thead><tr><th scope="col">{copy.dungeon}</th><th scope="col">{copy.timer}</th></tr></thead>
          <tbody>{[...dungeonSlugs].sort((a, b) => dungeonRoutes[a].timerSeconds - dungeonRoutes[b].timerSeconds).map((slug) => {
            const dungeon = dungeonRoutes[slug];
            return <tr key={slug}>
              <th scope="row"><a href={`${locale === "ru" ? "/ru" : ""}/wow/mythic-plus/${seasonSlug}/${slug}`}>{wowSourceName(dungeon.name, locale, dungeon.nameRu)}</a></th>
              <td>{Math.floor(dungeon.timerSeconds / 60)}:{String(dungeon.timerSeconds % 60).padStart(2, "0")}</td>
            </tr>;
          })}</tbody>
        </table>
      </AtlasSection>

      <AtlasSection id="dungeons" title={copy.listTitle}>
        <DungeonCardGrid locale={locale} hrefBase={`/wow/mythic-plus/${seasonSlug}`} priority={false} content={content} />
      </AtlasSection>
    </AtlasFrame>
  );
}
