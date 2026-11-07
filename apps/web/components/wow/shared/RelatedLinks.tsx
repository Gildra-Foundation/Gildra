import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./relatedLinks.module.css";

export type RelatedLink = { href: string; label: string; icon?: ReactNode };

/**
 * A compact row of links to the pages next to this one (a spec's talents,
 * leaderboard and tier lists; a dungeon's compositions and runs; a
 * profession's auction prices). No heading: the labels say where they lead.
 */
export function RelatedLinks({ label, links, className }: { label: string; links: readonly RelatedLink[]; className?: string }) {
  if (!links.length) return null;
  return (
    <nav aria-label={label} className={className ? `${styles.row} ${className}` : styles.row}>
      <ul className={styles.list}>
        {links.map((link) => (
          <li key={link.href}>
            <Link className={styles.link} href={link.href} prefetch={false}>{link.icon}<span>{link.label}</span></Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
