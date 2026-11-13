import type { ReactNode } from "react";
import Image from "next/image";
import { ArrowRight, MapPin } from "lucide-react";
import { MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { FOREVER_KIT } from "./foreverKit";
import { instanceArt } from "./instanceArt";
import { InstanceMotion } from "./InstanceMotion";
import styles from "./instanceCard.module.css";

export type InstanceCardProps = {
  /** Slug of the painting (public/assets/wow/ui/forever/instances). */
  art: string;
  title: string;
  /** The game's English name under a translated title. */
  alias?: string;
  /** Opens the dungeon's page; a raid card on its own page has none. */
  href?: string;
  location?: string;
  /** Short facts in one line: level band, bosses, players. The first one is the one players compare. */
  facts: ReactNode[];
  /** A small label on the painting ("New"). */
  tag?: string;
  heading?: "h2" | "h3";
  id?: string;
  /** Narrow screens: the painting beside the text instead of above it. */
  compact?: boolean;
  sizes?: string;
  children?: ReactNode;
};

/** "Painting + plaque" card of a Forever dungeon or raid: the painting sits in the Forever frame, the name is the one link. */
export function InstanceCard({ art, title, alias, href, location, facts, tag, heading: Heading = "h3", id, compact = false, sizes = "(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw", children }: InstanceCardProps) {
  const painting = instanceArt(art);
  return <MaterialPlaque kit={FOREVER_KIT} as="article" className={styles.card} data-link={href ? "" : undefined} data-compact={compact ? "" : undefined} aria-labelledby={id}>
    <div className={styles.art} aria-hidden="true">
      {painting && <Image className={styles.scene} src={painting.src} alt="" fill sizes={compact ? `(max-width: 640px) 132px, ${sizes}` : sizes} style={{ objectPosition: painting.position }} />}
      {tag && <span className={styles.tag}>{tag}</span>}
    </div>
    <div className={styles.body}>
      {location && <p className={styles.location}><MapPin aria-hidden="true" /><span>{location}</span></p>}
      <Heading id={id} className={styles.title}>{href ? <a href={href}>{title}</a> : title}</Heading>
      {alias && <p className={styles.alias} lang="en">{alias}</p>}
      <p className={styles.facts}>
        {facts.map((fact, index) => <span key={index}>{fact}</span>)}
        {href && <ArrowRight className={styles.arrow} aria-hidden="true" />}
      </p>
      {children}
    </div>
  </MaterialPlaque>;
}

/** The grid the cards stand in: three in a row, two on tablets, one on phones. */
export function InstanceCardGrid({ children, columns = 3, cascade = true }: { children: ReactNode; columns?: 2 | 3; cascade?: boolean }) {
  return <>
    <ul className={styles.grid} data-columns={columns} data-instance-cascade={cascade ? "" : undefined}>{children}</ul>
    {cascade && <InstanceMotion />}
  </>;
}
