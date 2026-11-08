"use client";

import { useEffect, type ReactNode } from "react";

/** Every route shares the Icecrown accent, including old saved preferences. */
export function SiteTheme({ children }: { children: ReactNode }) {
  useEffect(() => { document.documentElement.dataset.siteTheme = "arthas"; }, []);
  return children;
}
