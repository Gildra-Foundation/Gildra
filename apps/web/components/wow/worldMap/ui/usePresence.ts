"use client";

import { useEffect, useState } from "react";
import { lessMotion } from "@gildra/atlas-ui/motionPreference";

/**
 * Keeps a panel mounted while it plays its leaving animation: `present` stays
 * true for `ms` after `open` turns false, `state` tells the CSS which way to move.
 * With less motion the panel goes at once.
 */
export function usePresence(open: boolean, ms = 180) {
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  useEffect(() => {
    if (open || !present) return;
    const timer = window.setTimeout(() => setPresent(false), lessMotion() ? 0 : ms);
    return () => window.clearTimeout(timer);
  }, [open, present, ms]);
  return { present: open || present, state: open ? "open" : "closing" } as const;
}
