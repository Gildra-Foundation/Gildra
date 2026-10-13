"use client";
import { useEffect, useId, useRef } from "react";
import { usePathname } from "next/navigation";
import type { Lang } from "@/lib/i18n";
import { BookVolume } from "./BookVolume";
import styles from "./bookNavigation.module.css";

const liftEasing = "cubic-bezier(.4,0,.2,1)";

/** Uniform scale keeps the paper proportions while the book travels between two boxes. */
function liftTransform(from: DOMRect, to: DOMRect) {
  const scale = from.width / to.width;
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scale})`;
}

export function BookNavigationDialog({ open, onClose, lang, liftFrom, onLiftStart }: {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  /** The on-page book the dialog grows out of and returns to when it closes. */
  liftFrom?: () => DOMRect | null;
  onLiftStart?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const releasing = useRef(false);
  const titleId = useId();
  const ru = lang === "ru";
  const lifted = Boolean(liftFrom);
  // Read once per opening; a new callback identity never reopens the dialog.
  const lift = useRef({ liftFrom, onLiftStart });
  lift.current = { liftFrom, onLiftStart };
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open) {
      const previousFocus = document.activeElement;
      if (!element.open) element.showModal();
      releasing.current = false;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const from = lift.current.liftFrom?.();
      let growth: Animation | undefined;
      if (from && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        element.dataset.lift = "in";
        growth = element.animate([
          { transform: liftTransform(from, element.getBoundingClientRect()) },
          { transform: "none" },
        ], { duration: 560, easing: liftEasing });
      }
      lift.current.onLiftStart?.();
      return () => {
        growth?.cancel();
        document.body.style.overflow = previousOverflow;
        if (element.open) element.close();
        delete element.dataset.lift;
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
      };
    }
    if (element.open) element.close();
  }, [open]);
  useEffect(() => {
    if (previousPath.current !== pathname) { previousPath.current = pathname; onClose(); }
  }, [pathname, onClose]);
  /** Lay the book back where it was lifted from before the dialog closes. */
  function release() {
    const element = dialog.current;
    const to = liftFrom?.();
    if (!element || !to || releasing.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    releasing.current = true;
    element.dataset.lift = "out";
    const animation = element.animate([
      { transform: "none" },
      { transform: liftTransform(to, element.getBoundingClientRect()) },
    ], { duration: 460, easing: liftEasing, fill: "forwards" });
    void animation.finished.then(onClose, () => undefined);
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId}
    onCancel={(event) => {
      if (!lifted) { onClose(); return; }
      event.preventDefault();
      release();
    }}
    // Browsers may force-close a modal after repeated Escape presses; keep state in sync.
    onClose={() => { if (lifted && open) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) release(); }}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"))
        .filter((element) => element.getClientRects().length > 0);
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }}>
    <BookVolume lang={lang} active={open} titleId={titleId} onNavigate={onClose}
      closeButton={<button className={styles.close} type="button" onClick={release} aria-label={ru ? "Закрыть книгу" : "Close the book"}><span aria-hidden="true">×</span></button>} />
  </dialog>;
}
