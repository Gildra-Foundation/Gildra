"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
// Keep the shared contents toolbar styled before its lazy dialog loads.
import "@/components/platform/navigation/bookNavigation.module.css";
import { RouteTransitionRuntime } from "./RouteTransitionRuntime";

/** Root wrapper: atlas scope for inner routes and the page-to-page transition for all. */
export function RouteTransitionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const landing = pathname === "/" || pathname === "/ru" || pathname === "/ru/";
  return (
    // Inner pages: target of the toolbar's "skip to content" link, whatever the page is built with.
    <div className={landing ? "workspace-content" : "workspace-content gildra-atlas"} data-atlas-theme={landing ? undefined : "dark"} id={landing ? undefined : "atlas-content"} tabIndex={landing ? undefined : -1}>
      <RouteTransitionRuntime>{children}</RouteTransitionRuntime>
    </div>
  );
}
