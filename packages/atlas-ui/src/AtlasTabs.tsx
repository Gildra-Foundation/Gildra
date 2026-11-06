"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import clsx from "clsx";
import { useFlip } from "./valyro-ui/primitives/useFlip";
import { lessMotion, subscribeSiteMotion } from "./motionPreference";
import { playSwap } from "./swapMotion";
import styles from "./AtlasTabs.module.css";

export type AtlasTab = { id: string; label: ReactNode; content: ReactNode; count?: ReactNode };

/**
 * Tabs of the atlas (difficulties, roles, seasons). Every panel is rendered on
 * the server and inactive ones are `hidden`, so content stays in the HTML. The
 * tab list follows the ARIA pattern: arrows / Home / End move and select,
 * one tab stop. `segmented` is the compact pill group for two–four options.
 * The marker slides to the chosen tab and the new panel arrives with the
 * atlas switch motion (swapMotion.ts: fade, a short slide towards the chosen
 * tab, the height easing from the previous panel's).
 */
export function AtlasTabs({ tabs, label, defaultTab, value, variant = "underline", orientation = "horizontal", className, onChange }: {
  tabs: AtlasTab[];
  /** Accessible name of the tab list. */
  label: string;
  defaultTab?: string;
  /** Controlled selection: the parent owns the active tab (with onChange). */
  value?: string;
  variant?: "underline" | "segmented";
  /** Match the visible tab-list layout; vertical lists use Up/Down arrows. */
  orientation?: "horizontal" | "vertical";
  className?: string;
  onChange?: (id: string) => void;
}) {
  const base = useId();
  const [own, setActive] = useState(defaultTab && tabs.some((tab) => tab.id === defaultTab) ? defaultTab : tabs[0]?.id);
  const active = value !== undefined && tabs.some((tab) => tab.id === value) ? value : own;
  const listRef = useRef<HTMLDivElement>(null);
  const reduced = useSyncExternalStore(subscribeSiteMotion, lessMotion, () => true);
  const captureSelection = useFlip(listRef, { auto: true, enabled: !reduced, animateEnter: false, spring: "snappy" });

  useEffect(() => {
    if (reduced) {
      listRef.current?.querySelectorAll<HTMLElement>("[data-flip-id]").forEach(element => {
        element.getAnimations().filter(animation => animation.id === "ui-flip").forEach(animation => animation.cancel());
      });
    }
  }, [reduced]);

  const rootRef = useRef<HTMLDivElement>(null);
  const shownTab = useRef(active);
  const leaving = useRef<{ height: number; direction: number } | null>(null);
  useLayoutEffect(() => {
    if (shownTab.current === active) return;
    shownTab.current = active;
    const swap = leaving.current;
    leaving.current = null;
    const panel = rootRef.current?.querySelector<HTMLElement>(`:scope > [data-tab-panel="${CSS.escape(active ?? "")}"]`);
    if (panel && swap) playSwap(panel, { fromHeight: swap.height, direction: swap.direction });
  }, [active]);

  const select = (id: string, focus = false) => {
    captureSelection();
    if (id !== active) {
      // The panel that leaves gives its height to the one that arrives (read at the press, not on every render).
      const panel = rootRef.current?.querySelector<HTMLElement>(`:scope > [data-tab-panel="${CSS.escape(active ?? "")}"]`);
      const order = tabs.map((tab) => tab.id);
      leaving.current = { height: panel?.getBoundingClientRect().height ?? 0, direction: Math.sign(order.indexOf(id) - order.indexOf(active ?? "")) };
    }
    setActive(id);
    onChange?.(id);
    if (focus) listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${CSS.escape(id)}"]`)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    const previousKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    const target = event.key === nextKey ? (index + 1) % tabs.length
      : event.key === previousKey ? (index - 1 + tabs.length) % tabs.length
        : event.key === "Home" ? 0
          : event.key === "End" ? tabs.length - 1
            : -1;
    if (target < 0) return;
    event.preventDefault();
    select(tabs[target].id, true);
  };

  return (
    <div ref={rootRef} className={clsx(styles.tabs, styles[variant], className)}>
      <div ref={listRef} className={styles.list} role="tablist" aria-label={label} aria-orientation={orientation} onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              data-tab={tab.id}
              className={styles.tab}
              onClick={() => select(tab.id)}
            >
              {selected ? <span data-flip-id="tab-indicator" className={styles.indicator} aria-hidden="true" /> : null}
              <span>{tab.label}</span>
              {tab.count !== undefined ? <small className={styles.count}>{tab.count}</small> : null}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" id={`${base}-panel-${tab.id}`} aria-labelledby={`${base}-tab-${tab.id}`} hidden={tab.id !== active} tabIndex={0} className={styles.panel} data-tab-panel={tab.id}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
