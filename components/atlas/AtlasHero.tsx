import type { ReactNode } from "react";
import clsx from "clsx";
import { AtlasBreadcrumbs, type AtlasCrumb } from "./AtlasBreadcrumbs";
import { AtlasEmblem, type AtlasEmblemShape } from "./AtlasEmblem";
import { AtlasStats, type AtlasStat } from "./AtlasStats";
import styles from "./AtlasHero.module.css";

export type AtlasHeroProps = {
  title: ReactNode;
  /** Small amber line above the title, e.g. "World of Warcraft · Midnight". */
  eyebrow?: ReactNode;
  /** One or two sentences that say what the page is for. */
  lede?: ReactNode;
  /** Identity image left of the title (a spec icon, a portrait). Decorative glyphs are not used. */
  emblem?: ReactNode;
  emblemShape?: AtlasEmblemShape;
  stats?: AtlasStat[];
  statsLabel?: string;
  breadcrumbs?: AtlasCrumb[];
  breadcrumbsLabel?: string;
  /** Buttons under the lede. */
  actions?: ReactNode;
  /** Small controls on the right of the breadcrumbs row (e.g. AtlasLocaleSwitch). */
  toolbar?: ReactNode;
  /** Replaces the stats column (e.g. a sign-in card). */
  aside?: ReactNode;
  /** "open" (default) sits directly on the page artwork; "panel" frames it in a box. */
  variant?: "panel" | "open";
  titleId?: string;
  className?: string;
};

/** Page heading of every atlas route: emblem, eyebrow, title, lede, counters. */
export function AtlasHero({ title, eyebrow, lede, emblem, emblemShape = "circle", stats, statsLabel, breadcrumbs, breadcrumbsLabel = "Breadcrumbs", actions, toolbar, aside, variant = "open", titleId, className }: AtlasHeroProps) {
  const side = aside ?? (stats?.length ? <AtlasStats items={stats} label={statsLabel} className={styles.stats} /> : null);
  return (
    <header className={clsx(styles.hero, styles[variant], className)}>
      {breadcrumbs?.length || toolbar ? (
        <div className={styles.topRow}>
          {breadcrumbs?.length ? <AtlasBreadcrumbs items={breadcrumbs} label={breadcrumbsLabel} /> : <span />}
          {toolbar ? <div className={styles.toolbar}>{toolbar}</div> : null}
        </div>
      ) : null}
      <div className={clsx(styles.body, emblem ? styles.withEmblem : null, side ? styles.withSide : null)}>
        {emblem ? <AtlasEmblem shape={emblemShape} className={styles.emblem}>{emblem}</AtlasEmblem> : null}
        <div className={styles.copy}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <h1 id={titleId} className={styles.title}>{title}</h1>
          {lede ? <p className={styles.lede}>{lede}</p> : null}
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
        {side ? <div className={styles.side}>{side}</div> : null}
      </div>
    </header>
  );
}
