"use client";

import type { ReactNode, RefObject } from "react";
import clsx from "clsx";
import { Dialog } from "./valyro-ui/feedback/Dialog";
import styles from "./AtlasDialog.module.css";

/**
 * Modal of the atlas on Valyro's Dialog: focus trap, scroll lock, Esc and the
 * backdrop close it, focus returns to the opener. On phones (≤ 480px) it is a
 * bottom sheet; `sheet` keeps that sheet up to 720px.
 */
export function AtlasDialog({ open, onClose, label, children, variant = "panel", className, initialFocusRef }: {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  children: ReactNode;
  variant?: "panel" | "sheet";
  className?: string;
  /** What takes focus on opening (default: the first Tab stop, found by measuring every candidate). */
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      aria-label={label}
      size="lg"
      showClose={false}
      className={clsx(styles.dialog, styles[variant], className)}
      layerClassName={styles.layer}
      initialFocusRef={initialFocusRef}
    >
      {children}
    </Dialog>
  );
}
