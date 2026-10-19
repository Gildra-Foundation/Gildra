"use client";

import { useEffect, useRef } from "react";

/**
 * Brings the current encounter of the phone switcher row into view once, on mount.
 * Scrolls only the row (never the page), instantly; renders an empty hidden marker.
 */
export function CurrentEncounterInView({ current }: { current?: string }) {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const row = marker.current?.parentElement?.querySelector<HTMLElement>("ol");
    const item = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !item || row.scrollWidth <= row.clientWidth) return;
    const rowBox = row.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    const delta = itemBox.left + itemBox.width / 2 - (rowBox.left + rowBox.width / 2);
    row.scrollTo({ left: row.scrollLeft + delta, behavior: "instant" });
  }, [current]);

  return <span ref={marker} hidden />;
}
