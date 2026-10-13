import type { ReactNode } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight } from "lucide-react";
import buttonStyles from "./AtlasButton.module.css";
import styles from "./AtlasPagination.module.css";

type Step = { href: string; label: ReactNode; attributes?: Record<`data-${string}`, string | boolean | undefined> };

/**
 * Paging of a list (roadmap item 18): "previous" as a quiet link, "next" (or
 * "show more") as the primary action, an optional status in between
 * ("Page 2 of 5"). Plain links, so paging works without JavaScript and the
 * route runtime still animates it; `attributes` carries page hooks (data-*).
 */
export function AtlasPagination({ label, prev, next, status, className }: { label: string; prev?: Step; next?: Step; status?: ReactNode; className?: string }) {
  if (!prev && !next) return null;
  return (
    <nav className={clsx(styles.pagination, className)} aria-label={label}>
      {prev ? (
        <a className={clsx(buttonStyles.button, buttonStyles.ghost)} href={prev.href} rel="prev" {...prev.attributes}>
          <ArrowLeft aria-hidden="true" /><span>{prev.label}</span>
        </a>
      ) : <span />}
      {status ? <span className={styles.status}>{status}</span> : null}
      {next ? (
        <a className={clsx(buttonStyles.button, buttonStyles.primary)} href={next.href} rel="next" {...next.attributes}>
          <span>{next.label}</span><ArrowRight aria-hidden="true" />
        </a>
      ) : <span />}
    </nav>
  );
}
