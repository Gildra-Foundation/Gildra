"use client";

import { cloneElement, isValidElement, useSyncExternalStore, type ReactNode } from "react";
import { lessMotion, subscribeSiteMotion } from "./motionPreference";
import clsx from "clsx";
import { Tooltip } from "./valyro-ui/basic/Tooltip";
import bridge from "./valyroAtlasBridge.module.css";
import styles from "./AtlasTooltip.module.css";

const reducedOnServer = () => true;
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  const unsubscribe = subscribeSiteMotion(callback);
  return () => { media.removeEventListener("change", callback); unsubscribe(); };
}

/** Valyro handles hover/focus, Escape, collision positioning and spring entry. */
export function AtlasTooltip({ content, children, focusable = false, placement = "top", className }: { content: ReactNode; children: ReactNode; focusable?: boolean; placement?: "top" | "bottom"; className?: string }) {
  const reduced = useSyncExternalStore(subscribeMotion, lessMotion, reducedOnServer);
  const trigger = isValidElement<{ className?: string; tabIndex?: number }>(children)
    ? cloneElement(children, { className: clsx(styles.anchor, children.props.className, className), tabIndex: focusable ? 0 : children.props.tabIndex })
    : <span className={clsx(styles.anchor, className)} tabIndex={focusable ? 0 : undefined}>{children}</span>;
  return <Tooltip content={content} placement={placement} animation={reduced ? "fade" : "spring"} delay={200} className={bridge.scope}>
    {trigger}
  </Tooltip>;
}
