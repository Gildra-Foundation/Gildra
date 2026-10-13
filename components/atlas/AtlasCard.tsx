import { ViewTransition, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import clsx from "clsx";
import { artMorphName } from "@/lib/atlas/morph";
import { AtlasMorphPreload } from "./AtlasMorphPreload";
import styles from "./AtlasCard.module.css";

export type AtlasCardImage = { src: string; alt: string; sizes?: string; priority?: boolean; position?: string };
export type AtlasCardMeta = { icon?: ReactNode; label: ReactNode };

export type AtlasCardProps = {
  href: string;
  title: ReactNode;
  image?: AtlasCardImage;
  /** Label on the artwork, top right (activity type). */
  artBadge?: ReactNode;
  /** Small caption on the artwork, bottom right (timer, ilvl). */
  artCaption?: ReactNode;
  /** Location or category line above the title (tinted with `accent`). */
  eyebrow?: ReactNode;
  /** Secondary name, e.g. the original English title. */
  subtitle?: ReactNode;
  description?: ReactNode;
  /** Extra body content. Must not contain links: the whole card is one link. */
  children?: ReactNode;
  meta?: AtlasCardMeta[];
  /** Accessible name of the arrow at the end of the card ("Open route"); not shown as text. */
  cta?: ReactNode;
  /** Illustration colour of this entry; only tints the eyebrow and hover glow. */
  accent?: string;
  /** vertical — grid card; feature — wide card with the artwork on the left. */
  layout?: "vertical" | "feature";
  /** Aspect ratio of the artwork in the vertical layout (default "16 / 8.6"; portraits look better at "4 / 3.4"). */
  artRatio?: string;
  headingLevel?: 2 | 3;
  /** Portrait entries (bosses) lean towards the pointer. */
  tilt?: boolean;
  /** The picture morphs into the opened page's scene (that page sets AtlasFrame morphKey). Only for one card per destination on a page. */
  morph?: boolean;
  /** Scene of the opened page when it is not the card's own picture (warmed on hover for the morph). */
  morphArt?: string;
  className?: string;
};

/** Illustrated entry of an atlas list: raid, dungeon, boss, lair. */
export function AtlasCard({ href, title, image, artBadge, artCaption, eyebrow, subtitle, description, children, meta, cta, accent, layout = "vertical", artRatio, headingLevel = 3, tilt = false, morph = false, morphArt, className }: AtlasCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const style = { "--atlas-card-accent": accent, "--atlas-card-art-ratio": artRatio } as CSSProperties;
  const picture = image ? (
    <Image
      src={image.src}
      alt={image.alt}
      fill
      sizes={image.sizes ?? (layout === "feature" ? "(max-width: 900px) 100vw, 55vw" : "(max-width: 620px) 100vw, (max-width: 1100px) 50vw, 25vw")}
      priority={image.priority}
      style={image.position ? { objectPosition: image.position } : undefined}
    />
  ) : null;
  return (
    <article className={clsx(styles.card, styles[layout], className)} style={style} data-spotlight data-tilt={tilt || undefined}>
      <Link className={styles.link} href={href}>
        <div className={styles.art}>
          {picture ? (morph ? <ViewTransition name={artMorphName(href)} share="atlas-art-morph">{picture}</ViewTransition> : picture) : <span className={styles.artEmpty} aria-hidden="true" />}
          {morph && (morphArt ?? image?.src) ? <AtlasMorphPreload art={(morphArt ?? image?.src) as string} /> : null}
          <span className={styles.shade} aria-hidden="true" />
          {artBadge ? <span className={styles.artBadge}>{artBadge}</span> : null}
          {artCaption ? <span className={styles.artCaption}>{artCaption}</span> : null}
        </div>
        <div className={styles.body}>
          {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
          <Heading className={styles.title}>{title}</Heading>
          {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
          {description ? <p className={styles.description}>{description}</p> : null}
          {children ? <div className={styles.extra}>{children}</div> : null}
          {meta?.length || cta ? (
            <div className={styles.footer}>
              {meta?.length ? <span className={styles.meta}>{meta.map((item, metaIndex) => <span key={metaIndex}>{item.icon}{item.label}</span>)}</span> : null}
              {cta ? <span className={styles.cta}><span className={styles.srOnly}>{cta}</span><ArrowRight aria-hidden="true" /></span> : null}
            </div>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
