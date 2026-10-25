import type { CSSProperties } from "react";
import Image from "next/image";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { AtlasSection } from "@/components/atlas";
import { dungeonRoutes, dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import { wowSourceName } from "@/lib/wow/sourceLocale";
import { dungeonArtDirections } from "@/lib/wow/dungeonArtDirection";
import timerArtifacts from "../../../public/assets/wow/mythic/hub/controls/timers/manifest.json";
import { mythicHubControlLayout } from "./hub/mythicHubControls";
import { mythicAtlasCopy } from "./mythicAtlasCopy";
import { formatHubTimer, hubTimerCopy, hubTimerPercent } from "./mythicHubTimers";
import { mythicVerification } from "./mythicVerification";
import { verificationDate } from "./mythicVerificationCopy";
import styles from "./mythicHubTimers.module.css";

/** Static source-backed durations, shared with the dungeon detail pages. */
export function MythicHubTimers({ locale }: { locale: "ru" | "en" }) {
  const copy = hubTimerCopy[locale];
  const atlas = mythicAtlasCopy[locale];
  const slugs = [...dungeonSlugs].sort((a, b) => dungeonRoutes[a].timerSeconds - dungeonRoutes[b].timerSeconds);
  const longest = Math.max(...slugs.map((slug) => dungeonRoutes[slug].timerSeconds));
  const prefix = locale === "ru" ? "/ru" : "";

  return (
    <AtlasSection id="timers" className={styles.section} title={atlas.timersTitle} description={atlas.timersText}>
      <div className={styles.panel} data-mythic-hub-timers data-hub-reveal>
        <div className={styles.heading} aria-hidden="true">
          <span><Clock3 />{copy.label}</span>
          <span>{copy.units}</span>
        </div>
        <ol className={styles.list} aria-label={copy.list}>
          {slugs.map((slug) => {
            const dungeon = dungeonRoutes[slug];
            const art = timerArtifacts.entries[slug];
            const direction = dungeonArtDirections[slug];
            return (
              <li key={slug} className={styles.item} data-hub-reveal>
                <a
                  className={styles.link}
                  href={`${prefix}/wow/mythic-plus/midnight-season-2/${slug}`}
                  style={{
                    ...mythicHubControlLayout(slug),
                    "--hub-timer-share": `${hubTimerPercent(dungeon.timerSeconds, longest)}%`,
                    "--hub-timer-accent": direction.accent,
                  } as CSSProperties}
                  data-dungeon-timer={slug}
                  data-timer-theme={direction.motif}
                >
                  <span className={styles.artifact} aria-hidden="true" data-timer-artifact>
                    <Image src={art.path} alt="" width={art.width} height={art.height} unoptimized />
                  </span>
                  <span className={styles.name}>{wowSourceName(dungeon.name, locale, dungeon.nameRu)}</span>
                  <time className={styles.time} dateTime={`PT${dungeon.timerSeconds}S`} aria-label={copy.duration(dungeon.timerSeconds)}>
                    {formatHubTimer(dungeon.timerSeconds)}
                  </time>
                  <ArrowUpRight className={styles.arrow} aria-hidden="true" />
                  <span className={styles.track} aria-hidden="true"><span className={styles.fill} /></span>
                </a>
              </li>
            );
          })}
        </ol>
        <p className={styles.provenance}>
          {copy.snapshot} <time dateTime={mythicVerification.timers.checkedAt}>{verificationDate(mythicVerification.timers.checkedAt, locale)}</time>
          <span aria-hidden="true"> · </span>
          <a href={mythicVerification.timers.source}>{copy.source}<ArrowUpRight aria-hidden="true" /></a>
        </p>
      </div>
    </AtlasSection>
  );
}
