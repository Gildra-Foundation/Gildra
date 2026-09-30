import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { PlatformHomeData } from "@/lib/platform/home/types";
import type { Lang } from "@/lib/i18n";
import { platformHref } from "@/lib/platform/home/links";
import { ResilientImage } from "@/components/media/ResilientImage";
import { Panel, PanelTitle, TextLink } from "./primitives";
import styles from "./platformHome.module.css";

export function SavedBuilds({ data, lang }: { data: PlatformHomeData; lang: Lang }) {
  const games = new Map(data.games.map((game) => [game.id, game]));
  return (
    <Panel className={styles.savedBuilds}>
      <div className={styles.panelHeading}><PanelTitle>{data.labels.savedBuilds}</PanelTitle><TextLink href={platformHref("/search?type=items", lang)}>{data.labels.viewAll}</TextLink></div>
      <div className={styles.buildList}>
        {data.savedBuilds.map((build) => (
          <Link href={platformHref(build.href, lang)} prefetch={false} className={styles.buildRow} key={build.id} data-reveal-item>
            <ResilientImage src={build.imageUrl} alt="" width={34} height={34} loading="lazy" fallback={<img src={games.get(build.gameId)?.iconUrl ?? "/platform/icons/wow.svg"} alt="" width="34" height="34" />} />
            <span><strong>{build.title}</strong><small>{build.subtitle}</small></span>
            <small>{build.updatedAt}</small>
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
        ))}
      </div>
      <div className={styles.panelFooter}><TextLink href={platformHref("/search?type=items", lang)}>{data.labels.goToBuilds}</TextLink></div>
    </Panel>
  );
}
