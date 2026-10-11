"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./homeEntry.module.css";

type Highlight = { x: number; y: number; width: number; visible: boolean };

/** The same moving light beneath the label as the homepage navigation. */
export function EntryTextActions({ children }: { children: ReactNode }) {
  const group = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLButtonElement | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const show = useCallback((button: HTMLButtonElement) => {
    const root = group.current;
    const label = button.querySelector<HTMLElement>("[data-entry-label]");
    if (!root || !root.contains(button) || !label) return;
    active.current = button;
    const parent = root.getBoundingClientRect();
    const rect = label.getBoundingClientRect();
    setHighlight({ x: rect.left - parent.left, y: rect.bottom - parent.top + 5, width: rect.width, visible: true });
  }, []);
  const hide = useCallback(() => {
    active.current = null;
    setHighlight(previous => previous ? { ...previous, visible: false } : null);
  }, []);

  useEffect(() => {
    const root = group.current;
    if (!root) return;
    const resize = new ResizeObserver(() => {
      if (active.current && root.contains(active.current)) show(active.current);
      else hide();
    });
    resize.observe(root);
    root.querySelectorAll("[data-entry-label]").forEach(label => resize.observe(label));
    return () => resize.disconnect();
  }, [children, show, hide]);

  return <div ref={group} className={styles.actions}
    onPointerOver={event => {
      if (event.pointerType === "touch") return;
      const button = (event.target as HTMLElement).closest("button");
      if (button && !button.disabled) show(button);
    }}
    onFocus={event => { if (event.target instanceof HTMLButtonElement) show(event.target); }}
    onPointerLeave={() => {
      const focused = document.activeElement;
      if (focused instanceof HTMLButtonElement && group.current?.contains(focused)) show(focused);
      else hide();
    }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) hide(); }}>
    {highlight && <span className={styles.actionHighlight} aria-hidden="true" data-entry-highlight data-visible={highlight.visible} style={{
      width: highlight.width,
      transform: `translate3d(${highlight.x}px, ${highlight.y}px, 0)`,
      opacity: highlight.visible ? 1 : 0,
    }} />}
    {children}
  </div>;
}
