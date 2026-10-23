import type { ReactNode } from "react";
import { Info, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import "./valyro-ui/feedback/Alert.css";
import bridge from "./valyroAtlasBridge.module.css";
import styles from "./AtlasNotice.module.css";

/**
 * Honest status line: draft data, missing sources, disabled features. Valyro Alert's
 * markup and stylesheet rendered on the server (the vendor component is a client
 * module and pulls IconButton and Tooltip for its dismiss button; tests keep the
 * markup in step with feedback/Alert.tsx). A static notice is not news: no live
 * region; cautions are a note.
 */
export function AtlasNotice({ title, children, tone = "info", icon, action, className }: { title?: ReactNode; children?: ReactNode; tone?: "info" | "caution"; icon?: ReactNode; action?: ReactNode; className?: string }) {
  const glyph = icon ?? (tone === "caution" ? <TriangleAlert /> : <Info />);
  return (
    <div className={clsx("ui-alert", bridge.scope, styles.notice, className)} data-variant={tone === "caution" ? "warning" : "info"} role={tone === "caution" ? "note" : undefined}>
      <span className="ui-alert__icon" aria-hidden="true">{glyph}</span>
      <div className="ui-alert__content">
        {title ? <div className="ui-alert__title">{title}</div> : null}
        {children ? <div className="ui-alert__description">{children}</div> : null}
      </div>
      {action ? <div className="ui-alert__action">{action}</div> : null}
    </div>
  );
}
