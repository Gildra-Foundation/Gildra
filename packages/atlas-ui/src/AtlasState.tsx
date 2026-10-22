import type { ReactNode } from "react";
import clsx from "clsx";
import { EmptyState } from "./valyro-ui/data-display/EmptyState";
import { Skeleton } from "./valyro-ui/basic/Skeleton";
import bridge from "./valyroAtlasBridge.module.css";
import styles from "./AtlasState.module.css";

/** Shared Valyro states retain the atlas' public props and honest status text. */
export function AtlasEmpty({ title, children, action, className }: { title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return <EmptyState
    className={clsx(bridge.scope, styles.state, styles.empty, className)}
    role="status" size="sm" title={title} description={children}
    primaryAction={action ? <div className={styles.actions}>{action}</div> : undefined}
  />;
}

export function AtlasError({ title, children, actions, code, className }: { title: ReactNode; children?: ReactNode; actions?: ReactNode; /** Error digest for support. */ code?: string; className?: string }) {
  return <EmptyState
    className={clsx(bridge.scope, styles.state, styles.error, className)}
    role="alert" size="sm" title={title}
    icon={<span className={styles.mark} />}
    description={<>{children}{code ? <span className={styles.code}>{code}</span> : null}</>}
    primaryAction={actions ? <div className={styles.actions}>{actions}</div> : undefined}
  />;
}

/** Valyro shimmer retains the line/card/row footprints and the accessible loading label. */
export function AtlasSkeleton({ variant = "lines", count = 3, label, className }: { variant?: "lines" | "cards" | "rows"; count?: number; label: string; className?: string }) {
  return (
    <div className={clsx(bridge.scope, styles.skeleton, styles[variant], className)} role="status" aria-live="polite" aria-busy="true">
      {Array.from({ length: count }, (_, index) => <Skeleton key={index} className={styles.shape} height={variant === "lines" ? 14 : variant === "rows" ? 64 : "auto"} />)}
      <span className={styles.srOnly}>{label}</span>
    </div>
  );
}
