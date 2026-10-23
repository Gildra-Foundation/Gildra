import type { ReactNode } from "react";
import clsx from "clsx";
import type { BadgeColor } from "./valyro-ui/basic/Badge";
import "./valyro-ui/basic/Badge.css";
import bridge from "./valyroAtlasBridge.module.css";
import styles from "./AtlasBadge.module.css";

export type AtlasBadgeTone = "accent" | "neutral" | "positive" | "negative" | "info" | "caution";

const colors: Record<AtlasBadgeTone, BadgeColor> = { accent: "amber", neutral: "gray", positive: "green", negative: "red", info: "blue", caution: "amber" };

/**
 * Short label: activity type, difficulty, role, status. Valyro Badge's markup and
 * stylesheet rendered on the server — the vendor component is a client module and
 * would ship its code to every page with a badge (tests/valyro.test.mjs keeps the
 * markup in step with basic/Badge.tsx).
 */
export function AtlasBadge({ children, tone = "neutral", icon, className, title }: { children: ReactNode; tone?: AtlasBadgeTone; icon?: ReactNode; className?: string; title?: string }) {
  return (
    <span className={clsx("ui-badge", bridge.scope, styles.badge, className)} data-color={colors[tone]} data-variant="subtle" data-size="md" data-tone={tone} title={title}>
      {icon ? <span className="ui-badge__icon">{icon}</span> : null}
      <span className="ui-badge__label">{children}</span>
    </span>
  );
}
