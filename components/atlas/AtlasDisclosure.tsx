import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import styles from "./AtlasDisclosure.module.css";

/**
 * Native `<details>` styled with atlas tokens: long secondary detail stays in the
 * HTML (searchable, no client JS) but is folded until the reader asks for it.
 * Use it instead of deleting real content when a page gets too dense.
 */
export function AtlasDisclosure({ summary, children, open, className }: { summary: ReactNode; children: ReactNode; open?: boolean; className?: string }) {
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
