"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import clsx from "clsx";
import styles from "./AtlasTabs.module.css";

export type AtlasTab = { id: string; label: ReactNode; content: ReactNode; count?: ReactNode };

/**
 * Tabs of the atlas (difficulties, roles, seasons). Every panel is rendered on
 * the server and inactive ones are `hidden`, so content stays in the HTML. The
 * tab list follows the ARIA pattern: arrows / Home / End move and select,
 * one tab stop. `segmented` is the compact pill group for two–four options.
 */
export function AtlasTabs({ tabs, label, defaultTab, value, variant = "underline", className, onChange }: {
  tabs: AtlasTab[];
  /** Accessible name of the tab list. */
  label: string;
  defaultTab?: string;
  /** Controlled selection: the parent owns the active tab (with onChange). */
  value?: string;
  variant?: "underline" | "segmented";
  className?: string;
  onChange?: (id: string) => void;
}) {
  const base = useId();
  const [own, setActive] = useState(defaultTab && tabs.some((tab) => tab.id === defaultTab) ? defaultTab : tabs[0]?.id);
  const active = value !== undefined && tabs.some((tab) => tab.id === value) ? value : own;
  const listRef = useRef<HTMLDivElement>(null);

  const select = (id: string, focus = false) => {
    setActive(id);
    onChange?.(id);
    if (focus) listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${CSS.escape(id)}"]`)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    const target = event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
        : event.key === "Home" ? 0
          : event.key === "End" ? tabs.length - 1
            : -1;
    if (target < 0) return;
    event.preventDefault();
    select(tabs[target].id, true);
  };

  return (
    <div className={clsx(styles.tabs, styles[variant], className)}>
      <div ref={listRef} className={styles.list} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
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
              <span>{tab.label}</span>
              {tab.count !== undefined ? <small className={styles.count}>{tab.count}</small> : null}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" id={`${base}-panel-${tab.id}`} aria-labelledby={`${base}-tab-${tab.id}`} hidden={tab.id !== active} tabIndex={0} className={styles.panel}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
