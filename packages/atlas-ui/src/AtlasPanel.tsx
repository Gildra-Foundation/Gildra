import type { ElementType, ReactNode } from "react";
import clsx from "clsx";
import styles from "./AtlasPanel.module.css";

export type AtlasPanelProps = {
  children: ReactNode;
  /** default — framed dark panel; raised — lighter inner block; highlight — amber-edged focus panel. */
  tone?: "default" | "raised" | "highlight";
  padding?: "none" | "sm" | "md" | "lg";
  as?: ElementType;
  className?: string;
  id?: string;
  "aria-labelledby"?: string;
};

/** The framed dark surface used for every content block. Never nest a panel in a panel. */
export function AtlasPanel({ children, tone = "default", padding = "md", as: Element = "div", className, ...rest }: AtlasPanelProps) {
  return <Element className={clsx(styles.panel, styles[tone], styles[`pad-${padding}`], className)} {...rest}>{children}</Element>;
}
