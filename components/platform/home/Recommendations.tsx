import Link from "next/link";
import type { PlatformHomeData } from "@/lib/platform/home/types";
import type { Lang } from "@/lib/i18n";
import { platformHref } from "@/lib/platform/home/links";
import { ResilientImage } from "@/components/media/ResilientImage";
import { Panel, PanelTitle, TextLink } from "./primitives";
import styles from "./platformHome.module.css";

export function Recommendations({ data, lang }: { data: PlatformHomeData; lang: Lang }) {
  const games = new Map(data.games.map((game) => [game.id, game]));
  return (
    <Panel className={styles.recommendations}>
      <div className={styles.panelHeading}><PanelTitle>{data.labels.recommended}</PanelTitle><TextLink href={platformHref("/search", lang)}>{data.labels.viewAll}</TextLink></div>
      <div className={styles.recommendationGrid}>
        {data.recommendations.map((item) => {
          const game = games.get(item.gameId)!;
          return (
            <Link href={platformHref(item.href, lang)} prefetch={false} className={`${styles.recommendation} ${item.featured ? styles.recommendationFeatured : ""}`} key={item.id} data-reveal-item>
              <ResilientImage src={item.imageUrl} alt="" width={108} height={94} loading="lazy" fallback={<img src={game.iconUrl} alt="" width="108" height="94" />} />
              <span><small style={{ color: game.accent }}>{item.eyebrow}</small><strong>{item.title}</strong><p>{item.description}</p></span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}
