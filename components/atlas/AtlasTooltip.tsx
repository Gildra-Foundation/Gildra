"use client";

import { useId, type ReactNode } from "react";
import clsx from "clsx";
import styles from "./AtlasTooltip.module.css";

/**
 * A small hint above its trigger on hover and keyboard focus (spell names,
 * icons without text). The content is part of the DOM and linked with
 * aria-describedby. `focusable` gives a non-interactive trigger (an icon) a
 * tab stop so keyboard users can read it too.
 */
export function AtlasTooltip({ content, children, focusable = false, placement = "top", className }: { content: ReactNode; children: ReactNode; focusable?: boolean; placement?: "top" | "bottom"; className?: string }) {
  const id = useId();
  return (
    <span className={clsx(styles.anchor, styles[placement], className)} tabIndex={focusable ? 0 : undefined} aria-describedby={id}>
      {children}
      <span id={id} role="tooltip" className={styles.tip}>{content}</span>
    </span>
  );
}
