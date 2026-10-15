"use client";

import { type CSSProperties, type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./characterAuditPage.module.css";
import atlas from "./characterAtlasProfile.module.css";

let pinnedTooltipId: string | null = null;
const pinEvent = "gildra:item-tooltip-pinned";

export function WarcraftTooltip({ children, content, block = false, pinned = false, hoverDisabled = false, onPinnedClose, locale = "ru", atlasScope = false, className = "" }: { children: ReactNode | ((tooltipId: string | undefined) => ReactNode); content: ReactNode; block?: boolean; pinned?: boolean; hoverDisabled?: boolean; onPinnedClose?: () => void; locale?: "ru" | "en"; atlasScope?: boolean; className?: string }) {
  const tr = (text: string) => locale === "ru" ? text : text === "Описание предмета" ? "Item details" : "Close item details";
  const bookTheme = atlasScope;
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pinnedCloseRef = useRef(onPinnedClose);
  pinnedCloseRef.current = onPinnedClose;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPinnedRef = useRef(pinned);
  const suppressHoverRef = useRef(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, side: "bottom" as "top" | "bottom" });
  const open = pinned || hoverOpen;

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const tooltipWidth = Math.min(420, window.innerWidth - 24);
    const tooltipHeight = Math.min(tooltipRef.current?.offsetHeight ?? 420, window.innerHeight - 24);
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 12));
    const spaceAbove = rect.top - 12;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const side = spaceAbove >= tooltipHeight || spaceAbove > spaceBelow ? "top" : "bottom";
    const top = side === "top"
      ? Math.max(tooltipHeight + 12, rect.top - 10)
      : Math.min(rect.bottom + 10, window.innerHeight - tooltipHeight - 12);
    setPosition({ left, top, side });
  }, []);

  const show = () => {
    if (hoverDisabled || suppressHoverRef.current) return;
    if (pinnedTooltipId && pinnedTooltipId !== id) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (pinnedTooltipId && pinnedTooltipId !== id) return;
      updatePosition();
      setHoverOpen(true);
    }, 120);
  };
  const hide = () => {
    suppressHoverRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHoverOpen(false), 70);
  };

  useEffect(() => {
    if (pinned) {
      if (timerRef.current) clearTimeout(timerRef.current);
      suppressHoverRef.current = false;
      setHoverOpen(false);
      updatePosition();
    } else if (wasPinnedRef.current) {
      suppressHoverRef.current = true;
      setHoverOpen(false);
    }
    wasPinnedRef.current = pinned;
  }, [pinned, updatePosition]);

  useEffect(() => {
    if (hoverDisabled) setHoverOpen(false);
  }, [hoverDisabled]);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const schedulePosition = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updatePosition();
      });
    };
    updatePosition();
    const dismissHidden = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setHoverOpen(false);
      if (pinned) pinnedCloseRef.current?.();
    };
    const closeHidden = () => {
      if (anchorRef.current?.getClientRects().length) return;
      dismissHidden();
    };
    const onDisclosureToggle = (event: Event) => {
      const details = event.target;
      // Closed details can retain layout rectangles in Chromium.
      if (details instanceof HTMLDetailsElement && !details.open && anchorRef.current && details.contains(anchorRef.current)) dismissHidden();
    };
    const observer = new ResizeObserver(closeHidden);
    if (anchorRef.current) observer.observe(anchorRef.current);
    document.addEventListener("toggle", onDisclosureToggle, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", schedulePosition, { capture: true, passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("toggle", onDisclosureToggle, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", schedulePosition, true);
    };
  }, [open, pinned, updatePosition]);

  const hasPinnedClose = Boolean(onPinnedClose);
  useEffect(() => {
    if (!pinned || !hasPinnedClose) return;
    const closeOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail === id) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      suppressHoverRef.current = true;
      setHoverOpen(false);
      pinnedCloseRef.current?.();
    };
    window.addEventListener(pinEvent, closeOther);
    pinnedTooltipId = id;
    window.dispatchEvent(new CustomEvent(pinEvent, { detail: id }));
    return () => {
      window.removeEventListener(pinEvent, closeOther);
      if (pinnedTooltipId === id) pinnedTooltipId = null;
    };
  }, [pinned, hasPinnedClose, id]);
  useEffect(() => {
    if (!open || pinned) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (timerRef.current) clearTimeout(timerRef.current);
      suppressHoverRef.current = true;
      setHoverOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open, pinned]);
  useEffect(() => {
    if (!pinned || !hasPinnedClose) return;
    if (window.matchMedia("(max-width: 560px)").matches) closeRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (timerRef.current) clearTimeout(timerRef.current);
      suppressHoverRef.current = true;
      pinnedCloseRef.current?.();
      anchorRef.current?.querySelector("button")?.focus();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [pinned, hasPinnedClose]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const closePinned = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    suppressHoverRef.current = true;
    onPinnedClose?.();
    anchorRef.current?.querySelector("button")?.focus();
  };

  return <>
    <span ref={anchorRef} className={`${styles.tooltipAnchor} ${block ? styles.tooltipBlock : ""}`} aria-describedby={open ? id : undefined} onPointerEnter={show} onPointerLeave={hide} onFocusCapture={show} onBlurCapture={hide}>{typeof children === "function" ? children(open ? id : undefined) : children}</span>
    {open ? createPortal(<div ref={tooltipRef} id={id} role={pinned ? "dialog" : "tooltip"} aria-label={pinned ? tr("Описание предмета") : undefined} data-pinned={pinned || undefined} data-character-atlas={bookTheme || undefined} onPointerEnter={() => { if (timerRef.current) clearTimeout(timerRef.current); }} onPointerLeave={hide} className={`${className} ${styles.warcraftTooltip} ${position.side === "top" ? styles.tooltipTop : styles.tooltipBottom} ${bookTheme ? `gildra-atlas ${atlas.tooltip}` : ""}`} style={{ left: position.left, top: position.top } as CSSProperties}>{pinned && onPinnedClose ? <div className={styles.tooltipControls}><button ref={closeRef} type="button" onClick={closePinned} aria-label={tr("Закрыть описание предмета")}><X /></button></div> : null}{content}</div>, document.body) : null}
  </>;
}

