"use client";

import { useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";
import styles from "./AtlasDialog.module.css";

/**
 * Modal of the atlas on the native <dialog>: the browser traps focus, Esc
 * closes it and focus returns to the opener. `sheet` slides up from the bottom
 * on phones (and stays a centred panel on wider screens). Clicking the
 * backdrop closes it.
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
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={clsx(styles.dialog, styles[variant], className)}
      aria-label={label}
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
