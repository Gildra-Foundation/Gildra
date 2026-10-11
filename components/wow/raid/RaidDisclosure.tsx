import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import styles from "./raidDisclosure.module.css";

/**
 * Native `<details>` styled with atlas tokens: long secondary detail stays in the
 * HTML (searchable, no client JS) but is folded until the reader asks for it.
 * Kit candidate — nothing in it is raid-specific.
 */
export function RaidDisclosure({ summary, children, open, className }: { summary: ReactNode; children: ReactNode; open?: boolean; className?: string }) {
  return (
    <details className={clsx(styles.disclosure, className)} open={open}>
      <summary className={styles.summary}>
        <span>{summary}</span>
        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}
