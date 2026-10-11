import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";
import styles from "./AtlasGrid.module.css";

/**
 * Responsive card grid: `min` is the narrowest a column may get before wrapping.
 * `fit` stretches a short list across the row instead of leaving empty columns.
 */
export function AtlasGrid({ children, min = 280, gap = "md", fit = false, className, as: Element = "div" }: { children: ReactNode; min?: number; gap?: "sm" | "md"; fit?: boolean; className?: string; as?: "div" | "ul" | "ol" }) {
  return <Element className={clsx(styles.grid, styles[gap], fit && styles.fit, className)} style={{ "--atlas-grid-min": `${min}px` } as CSSProperties}>{children}</Element>;
}
