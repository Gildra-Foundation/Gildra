"use client";

import type { CSSProperties, PointerEventHandler, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import styles from "./combatIntelCard.module.css";

type TriggerBindings = {
  ref: RefObject<HTMLButtonElement | null>;
  "aria-controls": string;
  "aria-describedby": string;
  "aria-expanded": boolean;
  "data-open": true | undefined;
  onClick: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onPointerEnter: PointerEventHandler<HTMLButtonElement>;
  onPointerLeave: PointerEventHandler<HTMLButtonElement>;
};

export function IntelPopover({
  tone,
  kind,
  children,
  content,
}: {
  tone: string;
  kind: "enemy" | "ability";
  children: (bindings: TriggerBindings) => ReactNode;
  content: ReactNode;
}) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinned = useRef(false);
  const [open, setOpen] = useState(false);

  const clearClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const closeSoon = useCallback(() => {
    clearClose();
    if (!pinned.current) closeTimer.current = setTimeout(() => setOpen(false), 90);
  }, [clearClose]);

  const placeTooltip = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip || !tooltip.matches(":popover-open")) return;

    const edge = 12;
    const gap = 12;
    const triggerRect = trigger.getBoundingClientRect();
    const compact = window.innerWidth < 720;
    const width = Math.min(compact ? window.innerWidth - edge * 2 : 364, window.innerWidth - edge * 2);
    tooltip.style.setProperty("--tooltip-width", `${width}px`);
    const height = tooltip.offsetHeight;

    let x = edge;
    let y = Math.max(edge, window.innerHeight - height - edge);
    let side = "sheet";

    if (!compact) {
      const fitsLeft = triggerRect.left >= width + gap + edge;
      x = fitsLeft
        ? triggerRect.left - width - gap
        : Math.min(window.innerWidth - width - edge, triggerRect.right + gap);
      y = Math.min(Math.max(edge, triggerRect.top - 10), Math.max(edge, window.innerHeight - height - edge));
      side = fitsLeft ? "right" : "left";
    }

    tooltip.style.setProperty("--tooltip-x", `${Math.round(x)}px`);
    tooltip.style.setProperty("--tooltip-y", `${Math.round(y)}px`);
    tooltip.dataset.side = side;
  }, []);

  useEffect(() => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;

    const onToggle = (event: Event) => {
      const isOpen = (event as ToggleEvent).newState === "open";
      if (!isOpen) pinned.current = false;
      setOpen(isOpen);
    };
    tooltip.addEventListener("toggle", onToggle);
    return () => tooltip.removeEventListener("toggle", onToggle);
  }, []);

  useEffect(() => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;

    if (open && !tooltip.matches(":popover-open")) tooltip.showPopover();
    if (!open && tooltip.matches(":popover-open")) tooltip.hidePopover();
    if (!open) return;

    let scrollFrame = 0;
    const schedulePlacement = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        placeTooltip();
      });
    };
    const frame = requestAnimationFrame(placeTooltip);
    window.addEventListener("resize", placeTooltip);
    window.addEventListener("scroll", schedulePlacement, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      window.removeEventListener("resize", placeTooltip);
      window.removeEventListener("scroll", schedulePlacement, true);
    };
  }, [open, placeTooltip]);

  useEffect(() => {
    if (!open) return;

    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || tooltipRef.current?.contains(target)) return;
      pinned.current = false;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      pinned.current = false;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => () => clearClose(), [clearClose]);

  return (
    <>
      {children({
        ref: triggerRef,
        "aria-controls": tooltipId,
        "aria-describedby": tooltipId,
        "aria-expanded": open,
        "data-open": open || undefined,
        onClick: () => {
          clearClose();
          pinned.current = !pinned.current;
          setOpen(pinned.current);
        },
        onFocus: () => {
          clearClose();
          setOpen(true);
        },
        onBlur: closeSoon,
        onPointerEnter: (event) => {
          if (event.pointerType !== "mouse") return;
          clearClose();
          setOpen(true);
        },
        onPointerLeave: closeSoon,
      })}
      <div
        ref={tooltipRef}
        id={tooltipId}
        className={styles.tooltip}
        data-kind={kind}
        popover="manual"
        role="tooltip"
        style={{ "--intel-tone": tone } as CSSProperties}
        onPointerEnter={clearClose}
        onPointerLeave={closeSoon}
      >
        {open ? content : null}
      </div>
    </>
  );
}
