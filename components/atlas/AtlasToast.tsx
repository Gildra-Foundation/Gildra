"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./AtlasToast.module.css";

/**
 * A short confirmation at the bottom of the screen ("Link copied"). Announced
 * politely to screen readers, gone after `duration`. The caller owns the
 * message: pass null to hide it; `onDone` fires when it times out.
 */
const noSubscribe = () => () => {};

export function AtlasToast({ message, onDone, tone = "default", duration = 2600 }: { message: ReactNode | null; onDone: () => void; tone?: "default" | "negative"; duration?: number }) {
  // The portal target exists only after hydration.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  useEffect(() => {
    if (message === null) return;
    const timer = window.setTimeout(onDone, duration);
    return () => window.clearTimeout(timer);
  }, [message, onDone, duration]);
  if (!mounted) return null;
  return createPortal(
    <div className={styles.region} role="status" aria-live="polite" data-atlas-scope>
      {message !== null ? <p className={styles.toast} data-tone={tone}>{message}</p> : null}
    </div>,
    document.body,
  );
}
