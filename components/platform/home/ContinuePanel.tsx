import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { PlatformHomeData } from "@/lib/platform/home/types";
import type { Lang } from "@/lib/i18n";
import { platformHref } from "@/lib/platform/home/links";
import { ResilientImage } from "@/components/media/ResilientImage";
import { Panel, PanelTitle } from "./primitives";
import styles from "./platformHome.module.css";

export function ContinuePanel({ data, lang }: { data: PlatformHomeData; lang: Lang }) {
  const games = new Map(data.games.map((game) => [game.id, game]));
  return (
    <Panel className={styles.continuePanel}>
      <div className={styles.panelHeading}><PanelTitle>{data.labels.continueTitle}</PanelTitle><Link href={platformHref("/profile/arcanist", lang)} prefetch={false}>{data.labels.manage}</Link></div>
      <div className={styles.continueGrid}>
        {data.continueItems.map((item) => {
          const game = games.get(item.gameId)!;
          return (
            <article className={styles.continueCard} key={item.id} data-reveal-item>
              <div className={styles.continueIdentity}>
                <ResilientImage src={item.imageUrl} alt="" width={64} height={82} loading="lazy" fallback={<img src={game.iconUrl} alt="" width="64" height="82" />} />
                <span><strong>{item.title}</strong><small>{item.subtitle}</small><small>{item.detail}</small></span>
              </div>
              <div className={styles.continueActivity}><span>{item.activity}</span><small>{item.activityDetail}</small></div>
              <div className={styles.progressLine}><span><i data-progress style={{ width: `${item.progress}%`, background: game.accent }} /></span><small data-count>{item.progress}%</small></div>
              <Link className={styles.resumeButton} href={platformHref(item.href, lang)} prefetch={false}>{data.labels.resume}<ArrowRight size={14} /></Link>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}
