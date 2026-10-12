import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./AtlasState.module.css";

/**
 * The three honest states of a page or a block, with one look everywhere:
 * nothing to show yet (AtlasEmpty), something failed (AtlasError, role=alert)
 * and loading (AtlasSkeleton — torchlight passing over placeholder shapes).
 */
export function AtlasEmpty({ title, children, action, className }: { title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx(styles.state, styles.empty, className)} role="status">
      <span className={styles.mark} aria-hidden="true" />
      <p className={styles.title}>{title}</p>
      {children ? <p className={styles.text}>{children}</p> : null}
      {action ? <div className={styles.actions}>{action}</div> : null}
    </div>
  );
}

export function AtlasError({ title, children, actions, code, className }: { title: ReactNode; children?: ReactNode; actions?: ReactNode; /** Error digest for support. */ code?: string; className?: string }) {
  return (
    <div className={clsx(styles.state, styles.error, className)} role="alert">
      <span className={styles.mark} aria-hidden="true" />
      <p className={styles.title}>{title}</p>
      {children ? <p className={styles.text}>{children}</p> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
      {code ? <p className={styles.code}>{code}</p> : null}
    </div>
  );
}

/**
 * Placeholder shapes while data loads. `lines` — text, `cards` — a grid of
 * card shapes, `rows` — a list. The label is read by screen readers.
 */
export function AtlasSkeleton({ variant = "lines", count = 3, label, className }: { variant?: "lines" | "cards" | "rows"; count?: number; label: string; className?: string }) {
  return (
    <div className={clsx(styles.skeleton, styles[variant], className)} role="status" aria-live="polite">
      {Array.from({ length: count }, (_, index) => <span key={index} className={styles.shape} />)}
      <span className={styles.srOnly}>{label}</span>
    </div>
  );
}
