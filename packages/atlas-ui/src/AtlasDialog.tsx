"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { Dialog } from "./valyro-ui/feedback/Dialog";
import bridge from "./valyroAtlasBridge.module.css";
import styles from "./AtlasDialog.module.css";

/**
 * Modal of the atlas on Valyro's Dialog: focus trap, scroll lock, Esc and the
 * backdrop close it, focus returns to the opener. On phones (≤ 480px) it is a
 * bottom sheet; `sheet` keeps that sheet up to 720px.
 */
export function AtlasDialog({ open, onClose, label, children, variant = "panel", className }: {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  children: ReactNode;
  variant?: "panel" | "sheet";
  className?: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      aria-label={label}
      size="lg"
      showClose={false}
      className={clsx(bridge.scope, styles.dialog, styles[variant], className)}
      layerClassName={clsx(bridge.scope, styles.layer)}
    >
      {children}
    </Dialog>
  );
}
