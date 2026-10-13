import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./AtlasSection.module.css";

export type AtlasSectionProps = {
  children: ReactNode;
  title?: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Right side of the heading: a count, a link, a filter. */
  aside?: ReactNode;
  id?: string;
  /** Heading level; the page h1 lives in AtlasHero. */
  level?: 2 | 3;
  className?: string;
};

/** A titled block of the page body (roster, list, guide chapter). */
export function AtlasSection({ children, title, eyebrow, description, aside, id, level = 2, className }: AtlasSectionProps) {
  const Heading = level === 2 ? "h2" : "h3";
  const headingId = id ? `${id}-title` : undefined;
  const hasHeader = Boolean(title || eyebrow || aside);
  return (
    <section id={id} className={clsx(styles.section, className)} aria-labelledby={title ? headingId : undefined}>
      {hasHeader ? (
        <div className={styles.header}>
          <div className={styles.headingCopy}>
            {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
            {title ? <Heading id={headingId} className={clsx(styles.title, level === 3 && styles.titleSmall)}>{title}</Heading> : null}
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
          {aside ? <div className={styles.aside}>{aside}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
