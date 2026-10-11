import type { ReactNode } from "react";
import { Info, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import styles from "./AtlasNotice.module.css";

/** Honest status line: draft data, missing sources, disabled features. */
export function AtlasNotice({ title, children, tone = "info", icon, action, className }: { title?: ReactNode; children?: ReactNode; tone?: "info" | "caution"; icon?: ReactNode; action?: ReactNode; className?: string }) {
  const glyph = icon ?? (tone === "caution" ? <TriangleAlert /> : <Info />);
  return (
    <div className={clsx(styles.notice, styles[tone], className)} role={tone === "caution" ? "note" : undefined}>
      <span className={styles.icon} aria-hidden="true">{glyph}</span>
      <div className={styles.copy}>
        {title ? <strong>{title}</strong> : null}
        {children ? <div className={styles.text}>{children}</div> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
