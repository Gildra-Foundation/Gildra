import type { ReactNode } from "react";
import clsx from "clsx";
import { Badge, type BadgeColor } from "./valyro-ui/basic/Badge";
import bridge from "./valyroAtlasBridge.module.css";
import styles from "./AtlasBadge.module.css";

export type AtlasBadgeTone = "accent" | "neutral" | "positive" | "negative" | "info" | "caution";

const colors: Record<AtlasBadgeTone, BadgeColor> = { accent: "amber", neutral: "gray", positive: "green", negative: "red", info: "blue", caution: "amber" };

/** Short label on Valyro's Badge: activity type, difficulty, role, status. */
export function AtlasBadge({ children, tone = "neutral", icon, className, title }: { children: ReactNode; tone?: AtlasBadgeTone; icon?: ReactNode; className?: string; title?: string }) {
  return <Badge color={colors[tone]} icon={icon} title={title} data-tone={tone} className={clsx(bridge.scope, styles.badge, className)}>{children}</Badge>;
}
