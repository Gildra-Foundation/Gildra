import type { ReactNode } from "react";
import Image from "next/image";
import { ArrowRight, MapPin } from "lucide-react";
import { ForeverPanel } from "./shared/ForeverPanel";
import { instanceArt } from "./instanceArt";
import { InstanceMotion } from "./InstanceMotion";
import styles from "./instanceCard.module.css";

export type InstanceCardProps = {
  /** Slug of the painting (public/assets/wow/ui/forever/instances). */
  art: string;
  title: string;
  /** The game's English name under a translated title. */
  alias?: string;
  /** Opens the dungeon's page or the raid in the journal. */
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
};

/**
 * A Forever dungeon or raid as "painting + plaque" (after the Mythic+ atlas): the painting stands in the
 * frame of the section's panel, the name is the one link and the whole card opens it.
 */
export function InstanceCard({ art, title, alias, href, location, facts, tag, heading: Heading = "h3", id, compact = false, sizes = "(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw" }: InstanceCardProps) {
  const painting = instanceArt(art);
  return <ForeverPanel as="article" className={styles.card} data-link={href ? "" : undefined} data-compact={compact ? "" : undefined} aria-labelledby={id}>
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
    </div>
  </ForeverPanel>;
}

/**
 * The grid the cards stand in: three in a row, two on tablets, one on phones. A short grid rises with the
 * section's cascade (`data-forever-cascade`); a `long` one (the catalogue) rises card by card as it is scrolled.
 */
export function InstanceCardGrid({ children, long = false }: { children: ReactNode; long?: boolean }) {
  return long
    ? <><ul className={styles.grid} data-instance-cascade="">{children}</ul><InstanceMotion /></>
    : <ul className={styles.grid} data-forever-cascade="">{children}</ul>;
}
