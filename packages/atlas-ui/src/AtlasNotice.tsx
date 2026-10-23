import type { ReactNode } from "react";
import clsx from "clsx";
import { Alert } from "./valyro-ui/feedback/Alert";
import bridge from "./valyroAtlasBridge.module.css";
import styles from "./AtlasNotice.module.css";

/** Honest status line on Valyro's Alert: draft data, missing sources, disabled features. */
export function AtlasNotice({ title, children, tone = "info", icon, action, className }: { title?: ReactNode; children?: ReactNode; tone?: "info" | "caution"; icon?: ReactNode; action?: ReactNode; className?: string }) {
  // A static page notice is not news: no live region, a note for cautions (Valyro would announce them).
  return (
    <Alert
      variant={tone === "caution" ? "warning" : "info"}
      role={tone === "caution" ? "note" : undefined}
      title={title}
      description={children}
      icon={icon}
      action={action}
      className={clsx(bridge.scope, styles.notice, className)}
    />
  );
}
