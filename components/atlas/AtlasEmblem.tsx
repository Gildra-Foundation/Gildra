import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./AtlasEmblem.module.css";

export type AtlasEmblemShape = "circle" | "diamond" | "square";

/** Seal with an icon that marks a section of the atlas (journal, keystone, skull…). */
export function AtlasEmblem({ children, shape = "circle", size = "lg", className }: { children: ReactNode; shape?: AtlasEmblemShape; size?: "md" | "lg"; className?: string }) {
  return (
    <span className={clsx(styles.emblem, styles[shape], styles[size], className)} aria-hidden="true">
      <span className={styles.glyph}>{children}</span>
    </span>
  );
}
