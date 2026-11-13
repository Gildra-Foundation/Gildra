import type { ComponentProps, ReactNode } from "react";
import { AtlasHero } from "@gildra/atlas-ui/AtlasHero";
import { p, type Lang } from "@/lib/i18n-paths";
import { sharedCopy } from "./sharedCopy";
import styles from "./forever.module.css";

export type ForeverCrumb = { label: string; href?: string };

/** The one trail of the section: Forever › section › page. The last crumb is the open page. */
export function foreverTrail(lang: Lang, ...crumbs: ForeverCrumb[]) {
  return [{ label: sharedCopy[lang].root, href: p(lang, "/wow/forever") }, ...crumbs];
}

type HeroProps = ComponentProps<typeof AtlasHero>;
type Props = Pick<HeroProps, "title" | "eyebrow" | "lede" | "stats" | "statsLabel" | "actions" | "aside" | "placeholder" | "titleId"> & {
  lang: Lang;
  /** Crumbs after «Forever», the open page last (no href). The hub passes none and shows no trail. */
  trail?: ForeverCrumb[];
  /** The crest of the page: a class, profession or record icon (an <Image>), never a decorative sign. */
  crest?: ReactNode;
  className?: string;
};

/**
 * The heading of every Forever page: trail, eyebrow, crest, title, one line of text,
 * actions and the row of counters (only where the numbers mean something to a player).
 */
export function ForeverHero({ lang, trail, crest, className, ...hero }: Props) {
  return <AtlasHero {...hero} align="start" emblem={crest} emblemShape="square"
    breadcrumbs={trail?.length ? foreverTrail(lang, ...trail) : undefined} breadcrumbsLabel={sharedCopy[lang].breadcrumbs}
    className={className ? `${styles.hero} ${className}` : styles.hero} />;
}
