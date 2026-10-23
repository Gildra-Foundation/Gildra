import type { ReactNode } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "./valyro-ui/basic/Button";
import bridge from "./valyroAtlasBridge.module.css";
import buttonStyles from "./AtlasButton.module.css";
import styles from "./AtlasPagination.module.css";

type Step = { href: string; label: ReactNode; attributes?: Record<`data-${string}`, string | boolean | undefined> };

/**
 * Paging of a list (roadmap item 18): "previous" as a quiet link, "next" (or
 * "show more") as the primary action, an optional status in between
 * ("Page 2 of 5"). Valyro buttons rendered as plain links (asChild), so paging
 * works without JavaScript and the route runtime still animates it;
 * `attributes` carries page hooks (data-*).
 */
export function AtlasPagination({ label, prev, next, status, className }: { label: string; prev?: Step; next?: Step; status?: ReactNode; className?: string }) {
  if (!prev && !next) return null;
  return (
    <nav className={clsx(styles.pagination, className)} aria-label={label}>
      {prev ? (
        <Button asChild variant="ghost" leftIcon={<ArrowLeft aria-hidden="true" />} className={clsx(bridge.scope, buttonStyles.button)}>
          <a href={prev.href} rel="prev" {...prev.attributes}>{prev.label}</a>
        </Button>
      ) : <span />}
      {status ? <span className={styles.status}>{status}</span> : null}
      {next ? (
        <Button asChild variant="primary" rightIcon={<ArrowRight aria-hidden="true" />} className={clsx(bridge.scope, buttonStyles.button)}>
          <a href={next.href} rel="next" {...next.attributes}>{next.label}</a>
        </Button>
      ) : <span />}
    </nav>
  );
}
