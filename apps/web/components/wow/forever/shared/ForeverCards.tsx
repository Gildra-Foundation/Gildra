import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ForeverPanel } from "./ForeverPanel";
import styles from "./forever.module.css";

const tone = (value?: string) => (value ? { "--forever-tone": value } as CSSProperties : undefined);

/* ---------- Art cards ---------- */

/**
 * A grid of art cards. `min` is the narrowest card (px); `fit` stretches a short row to the full width;
 * `strip` turns the grid into a swipe row on a phone (banners), otherwise a phone shows two columns.
 */
export function ForeverArtGrid({ children, label, min = 220, fit = false, strip = false, className }: { children: ReactNode; label?: string; min?: number; fit?: boolean; strip?: boolean; className?: string }) {
  return <ul className={className ? `${styles.artGrid} ${className}` : styles.artGrid} aria-label={label} data-fit={fit ? "" : undefined} data-strip={strip ? "" : undefined}
    data-forever-cascade="" style={{ "--forever-min": `${min}px` } as CSSProperties}>{children}</ul>;
}

/** A place as a painted door: the painting, its name, one line under it, an optional fact in the corner (level band, players). */
export function ForeverArtCard({ href, art, title, note, badge, accent, ratio, sizes = "(max-width: 700px) 62vw, (max-width: 1200px) 33vw, 300px", priority = false }: {
  href: string;
  /** Painting under public/ (decor: the title names the card). */
  art: string;
  title: ReactNode;
  note?: ReactNode;
  badge?: ReactNode;
  /** Colour of the top edge and the note (default: the theme accent). A data colour or an --atlas token. */
  accent?: string;
  /** CSS aspect-ratio of the card (default 3 / 2). */
  ratio?: string;
  sizes?: string;
  priority?: boolean;
}) {
  return <li style={{ ...tone(accent), ...(ratio ? { "--forever-ratio": ratio } as CSSProperties : {}) }}>
    <Link className={styles.artCard} href={href} prefetch={false}>
      <Image src={art} alt="" fill sizes={sizes} quality={50} priority={priority} loading={priority ? undefined : "lazy"} />
      {badge ? <span className={styles.artBadge}>{badge}</span> : null}
      <strong className={styles.artTitle}>{title}</strong>
      {note ? <span className={styles.artNote}>{note}</span> : null}
    </Link>
  </li>;
}

/* ---------- Rows ---------- */

/** A grid of glass rows (tools, record types, next steps): 3 columns by default, 2 on a phone. */
export function ForeverRows({ children, label, columns = 3, className }: { children: ReactNode; label?: string; columns?: 2 | 3 | 4; className?: string }) {
  return <ul className={className ? `${styles.rows} ${className}` : styles.rows} aria-label={label} data-columns={columns} data-forever-cascade="">{children}</ul>;
}

/** One row: a sign in a medallion (a lucide or site glyph) or a game icon, a name, one quiet line. */
export function ForeverRow({ href, sign, icon, title, note, aside }: {
  href: string;
  /** Interface sign in a round medallion. */
  sign?: ReactNode;
  /** Game icon (URL) in a square medallion — instead of `sign`. */
  icon?: string;
  title: ReactNode;
  note?: ReactNode;
  /** Right edge: a number the player compares, or nothing (an arrow is drawn). */
  aside?: ReactNode;
}) {
  return <li>
    <Link className={styles.row} href={href} prefetch={false}>
      {icon ? <span className={styles.medallion} data-icon="" aria-hidden="true"><Image src={icon} alt="" width={40} height={40} unoptimized loading="lazy" /></span>
        : sign ? <span className={styles.medallion} aria-hidden="true">{sign}</span> : null}
      <span className={styles.rowText}><strong>{title}</strong>{note ? <span>{note}</span> : null}</span>
      <span className={styles.rowAside}>{aside ?? <ArrowRight aria-hidden="true" />}</span>
    </Link>
  </li>;
}

/* ---------- Crests ---------- */

/** A roster in one line (classes): `count` is how many stand in a row on a wide screen; a tablet shows two even rows, a phone three in a row. */
export function ForeverCrests({ children, label, count = 9, className }: { children: ReactNode; label: string; count?: number; className?: string }) {
  return <nav aria-label={label} className={className}>
    <ul className={styles.crests} data-forever-cascade="" style={{ "--forever-count": count, "--forever-half": Math.ceil(count / 2) } as CSSProperties}>{children}</ul>
  </nav>;
}

/** One crest: the game icon over the name, the edge in the class colour. */
export function ForeverCrest({ href, icon, label, color }: { href: string; icon: string; label: string; /** Class colour (lib/atlas/dataPalette). */ color?: string }) {
  return <li style={tone(color)}>
    <Link className={styles.crest} href={href} prefetch={false}>
      {/* An icon of the game's icon host is served as is; a local crest goes through the optimizer. */}
      <Image src={icon} alt="" width={56} height={56} quality={50} loading="lazy" decoding="async" unoptimized={/^https?:/.test(icon)} />
      <span>{label}</span>
    </Link>
  </li>;
}

/* ---------- List rows ---------- */

/** Lines of a list inside a <ForeverPanel>: records, bosses, recipes. */
export function ForeverList({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return <ul className={className ? `${styles.list} ${className}` : styles.list} aria-label={label}>{children}</ul>;
}

/** One line: an icon (a <ForeverIcon>), the name with one quiet line, values on the right. A link when `href` is given. */
export function ForeverListRow({ href, icon, title, note, values }: { href?: string; icon?: ReactNode; title: ReactNode; note?: ReactNode; values?: ReactNode }) {
  const body = <>
    {icon}
    <span className={styles.listText}><strong>{title}</strong>{note ? <span>{note}</span> : null}</span>
    {values ? <span className={styles.listValues}>{values}</span> : null}
  </>;
  const marks = { className: styles.listRow, "data-icon": icon ? "" : undefined };
  return <li>{href ? <Link {...marks} href={href} prefetch={false}>{body}</Link> : <div {...marks}>{body}</div>}</li>;
}

/* ---------- Feature ---------- */

/**
 * A large entry on the section's panel: a painting beside (or, `stacked`, above) the title, one
 * sentence and optional quick links. The title link covers the whole plaque; the quick links stay above it.
 */
export function ForeverFeature({ href, art, title, text, links, linksLabel, stacked = false, headingLevel = 3, sizes = "(max-width: 700px) 92vw, 640px" }: {
  href: string;
  art: string;
  title: ReactNode;
  text?: ReactNode;
  links?: readonly { href: string; label: string }[];
  linksLabel?: string;
  stacked?: boolean;
  headingLevel?: 2 | 3;
  sizes?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return <ForeverPanel as="article" className={styles.feature} data-stacked={stacked ? "" : undefined}>
    <div className={styles.featureArt} aria-hidden="true"><Image src={art} alt="" fill sizes={sizes} quality={50} loading="lazy" /></div>
    <div className={styles.featureBody}>
      <Heading><Link href={href} prefetch={false}>{title}<ArrowRight aria-hidden="true" /></Link></Heading>
      {text ? <p>{text}</p> : null}
      {links?.length ? <nav aria-label={linksLabel}><ul className={styles.featureLinks}>{links.map(link => <li key={link.href}><Link href={link.href} prefetch={false}>{link.label}</Link></li>)}</ul></nav> : null}
    </div>
  </ForeverPanel>;
}
