import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { wowSourceName } from "@/lib/wow/sourceLocale";
import { DungeonCardGrid } from "./DungeonCardGrid";
import { MythicDataNotice } from "./MythicDataNotice";
import { dungeonRoutes, dungeonSlugs } from "./dungeonRoutes";
import { mythicAtlasCopy } from "./mythicAtlasCopy";
import { mythicVerification } from "./mythicVerification";
import { verificationDate } from "./mythicVerificationCopy";
import { trail } from "@/lib/routes/registry";
import styles from "./mythicAtlasPage.module.css";

export function MythicAtlasPage({ locale }: { locale: "ru" | "en" }) {
  const copy = mythicAtlasCopy[locale];
  const bossTotal = dungeonSlugs.reduce((sum, slug) => sum + dungeonRoutes[slug].stops.filter((stop) => stop.kind === "boss").length, 0);

  return (
    <AtlasFrame lang={locale} scene="mythicPlus">
      <AtlasHero
        align="chapter"
        breadcrumbs={trail(locale, "mythicPlus")}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={copy.eyebrow}
        title={copy.title}
        lede={copy.lede}
        actions={<a className={styles.compareLink} href="#timers">{copy.compare}</a>}
        statsLabel={copy.statsLabel}
        stats={[
          { value: dungeonSlugs.length, label: copy.dungeons },
          { value: bossTotal, label: copy.bosses },
          { value: "S2", label: copy.season },
        ]}
      />

      <MythicDataNotice locale={locale} />

      <AtlasSection id="dungeons" title={copy.listTitle}>
        <DungeonCardGrid locale={locale} hrefBase="/wow/mythic-plus/midnight-season-2" priority={false} />
      </AtlasSection>

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
              <th scope="row"><a href={`${locale === "ru" ? "/ru" : ""}/wow/mythic-plus/midnight-season-2/${slug}`}>{wowSourceName(dungeon.name, locale, dungeon.nameRu)}</a></th>
              <td>{Math.floor(dungeon.timerSeconds / 60)}:{String(dungeon.timerSeconds % 60).padStart(2, "0")}</td>
            </tr>;
          })}</tbody>
        </table>
      </AtlasSection>
    </AtlasFrame>
  );
}
