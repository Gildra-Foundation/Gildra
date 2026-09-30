import Link from "next/link";
import type { PlatformHomeData } from "@/lib/platform/home/types";
import type { Lang } from "@/lib/i18n";
import { platformHref } from "@/lib/platform/home/links";
import { ResilientImage } from "@/components/media/ResilientImage";
import { Panel, PanelTitle, Sparkline, TextLink } from "./primitives";
import styles from "./platformHome.module.css";

export function PersonalMeta({ data, lang }: { data: PlatformHomeData; lang: Lang }) {
  const games = new Map(data.games.map((game) => [game.id, game]));
  return (
    <Panel className={styles.personalMeta}>
      <PanelTitle info>{data.labels.personalMeta}</PanelTitle>
      <div className={styles.metaScroll}>
        <div className={styles.metaHeader} aria-hidden="true">
          {data.labels.personalMetaColumns.map((column) => <span key={column}>{column}</span>)}
        </div>
        <div className={styles.metaRows}>
          {data.personalMeta.map((row) => {
            const game = games.get(row.gameId)!;
            return (
              <Link className={styles.metaRow} href={platformHref(row.href, lang)} prefetch={false} key={row.id}>
                <span className={styles.metaGame}>
                  <img src={game.iconUrl} alt="" width="48" height="48" decoding="async" />
                  <span><strong>{game.name}</strong><small style={{ color: game.accent }}>{row.mode}</small></span>
                </span>
                <span className={styles.metaFocus}>
                  <ResilientImage src={row.focusIconUrl} alt="" width={34} height={34} loading="lazy" fallback={<img src={game.iconUrl} alt="" width="34" height="34" />} />
                  <span><strong>{row.focus}</strong><small>{row.focusDetail}</small></span>
                </span>
                <span className={styles.metric}><small>{row.rankLabel}</small><strong data-count>{row.rankValue}</strong><small>{row.rankNote}</small></span>
                <span className={styles.metric}><strong data-count>{row.score}</strong><small>{row.scoreLabel}</small></span>
                <span className={styles.trend}><Sparkline values={row.trend} color={game.accent} /></span>
                <span className={`${styles.change} ${styles[row.changeTone]}`}><strong data-count>{row.change}</strong><small>{row.changeNote}</small></span>
              </Link>
            );
          })}
        </div>
      </div>
      <div className={styles.panelFooter}><TextLink href={platformHref("/analytics", lang)}>{data.labels.viewInsights}</TextLink></div>
    </Panel>
  );
}
