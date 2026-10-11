import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./AtlasBadge.module.css";

export type AtlasBadgeTone = "accent" | "neutral" | "positive" | "negative" | "info" | "caution";

/** Short uppercase label: activity type, difficulty, role, status. */
export function AtlasBadge({ children, tone = "neutral", icon, className, title }: { children: ReactNode; tone?: AtlasBadgeTone; icon?: ReactNode; className?: string; title?: string }) {
  return <span className={clsx(styles.badge, styles[tone], className)} title={title}>{icon}{children}</span>;
}
